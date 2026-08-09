<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Support\Barcode;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Création et mise à jour des produits et de leurs variantes.
 *
 * Chaque variante reçoit automatiquement un SKU lisible et un code-barres
 * EAN-13 valide : le gérant n'a jamais à les saisir à la main.
 */
class ProductService
{
    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<int, array<string, mixed>>  $variants
     */
    public function create(array $attributes, array $variants): Product
    {
        return DB::transaction(function () use ($attributes, $variants) {
            $product = Product::create([
                ...$attributes,
                'reference' => $attributes['reference'] ?? Product::nextReference(),
                'created_by' => $attributes['created_by'] ?? Auth::id(),
            ]);

            $this->syncVariants($product, $variants);

            return $product->fresh(['variants', 'category', 'brand']);
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<int, array<string, mixed>>  $variants
     */
    public function update(Product $product, array $attributes, array $variants): Product
    {
        return DB::transaction(function () use ($product, $attributes, $variants) {
            $product->update($attributes);

            $this->syncVariants($product, $variants);

            return $product->fresh(['variants', 'category', 'brand']);
        });
    }

    /**
     * Aligne les variantes du produit sur la liste fournie.
     *
     * Une variante absente de la liste est désactivée plutôt que supprimée si
     * elle a déjà servi (stock, ventes, mouvements) : supprimer casserait
     * l'historique.
     *
     * @param  array<int, array<string, mixed>>  $variants
     */
    public function syncVariants(Product $product, array $variants): void
    {
        $keptIds = [];

        foreach (array_values($variants) as $position => $data) {
            $id = isset($data['id']) ? (int) $data['id'] : null;

            $payload = [
                'size' => $this->nullableString($data['size'] ?? null),
                'color' => $this->nullableString($data['color'] ?? null),
                'dimensions' => $this->nullableString($data['dimensions'] ?? null),
                'weight_kg' => isset($data['weight_kg']) && $data['weight_kg'] !== '' ? (float) $data['weight_kg'] : null,
                'capacity_l' => isset($data['capacity_l']) && $data['capacity_l'] !== '' ? (int) $data['capacity_l'] : null,
                'selling_price' => max(0, (int) ($data['selling_price'] ?? 0)),
                // isset() écarte déjà la valeur null : reste à écarter la chaîne
                // vide, qu'un champ de formulaire laissé blanc renvoie.
                'web_price' => isset($data['web_price']) && $data['web_price'] !== ''
                    ? max(0, (int) $data['web_price'])
                    : null,
                'compare_at_price' => isset($data['compare_at_price']) && $data['compare_at_price'] !== ''
                    ? max(0, (int) $data['compare_at_price'])
                    : null,
                'low_stock_threshold' => max(0, (int) ($data['low_stock_threshold'] ?? 3)),
                'is_active' => (bool) ($data['is_active'] ?? true),
                'position' => $position,
            ];

            // Le prix de revient n'est modifiable à la main qu'à la création :
            // ensuite c'est le PMP, recalculé à chaque arrivage.
            if ($id === null) {
                $payload['cost_price'] = max(0, (int) ($data['cost_price'] ?? 0));
            }

            $variant = $id
                ? $product->variants()->whereKey($id)->first()
                : null;

            if ($variant) {
                $variant->update($payload);
            } else {
                $variant = $product->variants()->create([
                    ...$payload,
                    'sku' => $this->generateSku($product, $payload['size'], $payload['color']),
                    'stock_quantity' => 0,
                ]);
            }

            $this->ensureBarcode($variant, $data['barcode'] ?? null);

            $keptIds[] = $variant->id;
        }

        $removed = $product->variants()->whereNotIn('id', $keptIds ?: [0])->get();

        foreach ($removed as $variant) {
            if ($this->isUsed($variant)) {
                $variant->update(['is_active' => false]);
            } else {
                $variant->delete();
            }
        }
    }

    /**
     * Attribue un code-barres à la variante.
     * Un code fabricant saisi à la main est conservé tel quel ; sinon on en
     * génère un en interne à partir de l'identifiant de la variante.
     */
    public function ensureBarcode(ProductVariant $variant, ?string $provided = null): ProductVariant
    {
        $provided = $provided !== null ? trim($provided) : null;

        if (filled($provided)) {
            if ($provided !== $variant->barcode && ! $this->barcodeTaken($provided, $variant->id)) {
                $variant->update(['barcode' => $provided]);
            }

            return $variant;
        }

        if (blank($variant->barcode)) {
            $variant->update(['barcode' => Barcode::forVariant($variant->id)]);
        }

        return $variant;
    }

    /** SKU lisible : SV-0012-CAB-NOI */
    public function generateSku(Product $product, ?string $size, ?string $color): string
    {
        $parts = array_filter([
            $this->shortCode($size),
            $this->shortCode($color),
        ]);

        $base = $product->reference.($parts ? '-'.implode('-', $parts) : '');
        $sku = $base;
        $i = 2;

        while (ProductVariant::where('sku', $sku)->exists()) {
            $sku = "{$base}-{$i}";
            $i++;
        }

        return $sku;
    }

    protected function shortCode(?string $value): ?string
    {
        if (blank($value)) {
            return null;
        }

        $ascii = Str::upper(Str::ascii($value));
        $letters = preg_replace('/[^A-Z0-9]/', '', $ascii);

        return $letters ? Str::substr($letters, 0, 3) : null;
    }

    protected function barcodeTaken(string $barcode, int $ignoreVariantId): bool
    {
        return ProductVariant::where('barcode', $barcode)
            ->whereKeyNot($ignoreVariantId)
            ->exists();
    }

    /** Une variante est « utilisée » dès qu'elle a du stock ou un historique. */
    protected function isUsed(ProductVariant $variant): bool
    {
        return $variant->stock_quantity !== 0
            || $variant->stockMovements()->exists()
            || $variant->saleItems()->exists()
            || $variant->arrivalItems()->exists();
    }

    protected function nullableString(mixed $value): ?string
    {
        $value = is_string($value) ? trim($value) : $value;

        return blank($value) ? null : (string) $value;
    }
}
