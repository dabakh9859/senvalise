<?php

namespace App\Services;

use App\Enums\MovementReason;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Message;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Sale;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Fusion de fiches en double.
 *
 * Le principe est le même partout : on désigne la fiche qui reste, tout ce qui
 * est rattaché aux autres bascule vers elle, puis les doublons disparaissent.
 * Rien n'est perdu — ni une vente, ni une facture, ni une quantité en stock.
 */
class MergeService
{
    public function __construct(private readonly StockService $stock) {}

    /**
     * Fusionne des produits.
     *
     * Les déclinaisons identiques (même taille, même couleur) sont regroupées :
     * leurs quantités s'additionnent et le prix de revient est recalculé en
     * moyenne pondérée. Les déclinaisons sans équivalent sont simplement
     * rattachées au produit conservé.
     *
     * @param  array<int, int>  $sourceIds
     * @return array{merged_variants: int, moved_variants: int, moved_stock: int}
     */
    public function products(Product $target, array $sourceIds): array
    {
        $ids = $this->cleanIds($target->id, $sourceIds);
        $sources = Product::whereIn('id', $ids)->get();
        $this->assertAllFound($sources->count(), $ids);

        return DB::transaction(function () use ($target, $sources) {
            $mergedVariants = 0;
            $movedVariants = 0;
            $movedStock = 0;

            foreach ($sources as $source) {
                foreach ($source->variants()->get() as $variant) {
                    $twin = $this->matchingVariant($target, $variant);

                    if (! $twin) {
                        // Pas d'équivalent : la déclinaison change de parent,
                        // avec son stock et son historique.
                        $variant->update(['product_id' => $target->id]);
                        $movedVariants++;

                        continue;
                    }

                    $quantity = $variant->stock_quantity;

                    if ($quantity > 0) {
                        // Deux mouvements plutôt qu'une écriture directe : le
                        // journal de stock reste équilibré et la fusion se
                        // relit dans l'historique.
                        $this->stock->move(
                            variant: $variant,
                            quantity: -$quantity,
                            reason: MovementReason::Correction,
                            note: "Fusion vers {$twin->sku}",
                        );

                        $this->stock->move(
                            variant: $twin,
                            quantity: $quantity,
                            reason: MovementReason::Correction,
                            unitCost: $variant->cost_price,
                            note: "Fusion depuis {$variant->sku}",
                        );

                        $movedStock += $quantity;
                    }

                    // Conservée mais retirée de la vente : les lignes de vente
                    // déjà enregistrées continuent de pointer dessus.
                    $variant->update(['is_active' => false]);
                    $mergedVariants++;
                }

                $source->images()->update(['product_id' => $target->id]);
                $source->refresh()->delete();
            }

            return [
                'merged_variants' => $mergedVariants,
                'moved_variants' => $movedVariants,
                'moved_stock' => $movedStock,
            ];
        });
    }

    /**
     * Fusionne des clients : ventes, devis, factures, bons de livraison et
     * messages basculent sur la fiche conservée.
     *
     * @param  array<int, int>  $sourceIds
     * @return array{sales: int, documents: int, messages: int}
     */
    public function customers(Customer $target, array $sourceIds): array
    {
        $ids = $this->cleanIds($target->id, $sourceIds);
        $sources = Customer::whereIn('id', $ids)->get();
        $this->assertAllFound($sources->count(), $ids);

        return DB::transaction(function () use ($target, $sources, $ids) {
            $sales = Sale::whereIn('customer_id', $ids)->update(['customer_id' => $target->id]);
            $documents = Document::whereIn('customer_id', $ids)->update(['customer_id' => $target->id]);
            $messages = Message::whereIn('customer_id', $ids)->update(['customer_id' => $target->id]);

            // On complète les cases vides de la fiche conservée avec ce que les
            // doublons avaient de renseigné : rien ne se perd.
            $this->fillGaps($target, $sources->all(), [
                'phone', 'email', 'address', 'city', 'ninea', 'company_name',
            ]);

            foreach ($sources as $source) {
                $source->delete();
            }

            return [
                'sales' => $sales,
                'documents' => $documents,
                'messages' => $messages,
            ];
        });
    }

    /**
     * Fusionne des catégories : les produits sont transférés.
     *
     * @param  array<int, int>  $sourceIds
     * @return array{products: int}
     */
    public function categories(Category $target, array $sourceIds): array
    {
        $ids = $this->cleanIds($target->id, $sourceIds);
        $sources = Category::whereIn('id', $ids)->get();
        $this->assertAllFound($sources->count(), $ids);

        return DB::transaction(function () use ($target, $sources, $ids) {
            $products = Product::whereIn('category_id', $ids)
                ->update(['category_id' => $target->id]);

            foreach ($sources as $source) {
                $source->delete();
            }

            return ['products' => $products];
        });
    }

    /**
     * Déclinaison du produit conservé correspondant à celle du doublon.
     * Le rapprochement se fait sur la taille et la couleur, insensible à la
     * casse et aux espaces.
     */
    protected function matchingVariant(Product $target, ProductVariant $variant): ?ProductVariant
    {
        $signature = $this->variantSignature($variant);

        return $target->variants()
            ->get()
            ->first(fn (ProductVariant $candidate) => $this->variantSignature($candidate) === $signature);
    }

    protected function variantSignature(ProductVariant $variant): string
    {
        return mb_strtolower(trim((string) $variant->size).'|'.trim((string) $variant->color));
    }

    /**
     * Identifiants à fusionner, nettoyés : la fiche conservée ne peut pas
     * figurer parmi celles à absorber, et les doublons de sélection sautent.
     *
     * @param  array<int, int>  $sourceIds
     * @return array<int, int>
     */
    protected function cleanIds(int $targetId, array $sourceIds): array
    {
        $ids = array_values(array_unique(array_filter(
            array_map('intval', $sourceIds),
            fn (int $id) => $id > 0 && $id !== $targetId,
        )));

        if ($ids === []) {
            throw new RuntimeException('Choisissez au moins une fiche à fusionner.');
        }

        return $ids;
    }

    /** @param  array<int, int>  $ids */
    protected function assertAllFound(int $found, array $ids): void
    {
        if ($found !== count($ids)) {
            throw new RuntimeException('Une des fiches sélectionnées est introuvable.');
        }
    }

    /**
     * @param  array<int, Customer>  $sources
     * @param  array<int, string>  $fields
     */
    protected function fillGaps(Customer $target, array $sources, array $fields): void
    {
        $changes = [];

        foreach ($fields as $field) {
            if (filled($target->{$field})) {
                continue;
            }

            foreach ($sources as $source) {
                if (filled($source->{$field})) {
                    $changes[$field] = $source->{$field};
                    break;
                }
            }
        }

        if ($changes !== []) {
            $target->update($changes);
        }
    }
}
