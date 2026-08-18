<?php

namespace App\Services;

use App\Enums\MovementReason;
use App\Enums\MovementType;
use App\Models\ProductVariant;
use App\Models\Setting;
use App\Models\StockMovement;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Point de passage unique pour toute modification de stock.
 *
 * Rien d'autre dans l'application ne doit écrire directement dans
 * product_variants.stock_quantity : en passant systématiquement par ici, on
 * garantit qu'un mouvement est tracé pour chaque variation de quantité.
 */
class StockService
{
    /**
     * Enregistre un mouvement de stock.
     *
     * @param  int  $quantity  Signé : positif pour une entrée, négatif pour une sortie.
     * @param  int|null  $unitCost  Prix de revient unitaire (FCFA) — sert au recalcul du PMP en entrée.
     */
    public function move(
        ProductVariant $variant,
        int $quantity,
        MovementReason $reason,
        ?Model $reference = null,
        ?int $unitCost = null,
        ?string $note = null,
        ?MovementType $type = null,
        ?int $userId = null,
        bool $respectReservations = false,
    ): StockMovement {
        if ($quantity === 0) {
            throw new RuntimeException('Un mouvement de stock ne peut pas avoir une quantité nulle.');
        }

        return DB::transaction(function () use ($variant, $quantity, $reason, $reference, $unitCost, $note, $type, $userId, $respectReservations) {
            if ($respectReservations && $quantity < 0) {
                $requested = abs($quantity);
                $updated = ProductVariant::query()
                    ->whereKey($variant->getKey())
                    ->whereRaw('stock_quantity - reserved_quantity >= ?', [$requested])
                    ->decrement('stock_quantity', $requested);

                if ($updated !== 1) {
                    throw new RuntimeException(
                        "Stock disponible insuffisant pour « {$variant->sku} » : cet article est peut-être réservé en ligne."
                    );
                }

                /** @var ProductVariant $locked */
                $locked = ProductVariant::query()->findOrFail($variant->getKey());
                $after = $locked->stock_quantity;
                $before = $after - $quantity;

                $variant->setRawAttributes($locked->getAttributes(), true);

                return StockMovement::create([
                    'product_variant_id' => $locked->id,
                    'type' => ($type ?? $this->typeFor($quantity, $reason))->value,
                    'reason' => $reason->value,
                    'quantity' => $quantity,
                    'quantity_before' => $before,
                    'quantity_after' => $after,
                    'unit_cost' => $unitCost ?? $locked->cost_price,
                    'reference_type' => $reference ? $reference::class : null,
                    'reference_id' => $reference?->getKey(),
                    'user_id' => $userId ?? Auth::id(),
                    'note' => $note,
                ]);
            }

            /** @var ProductVariant $locked */
            $locked = ProductVariant::query()->lockForUpdate()->findOrFail($variant->getKey());

            $before = $locked->stock_quantity;
            $after = $before + $quantity;

            if ($after < 0 && ! $this->negativeStockAllowed()) {
                throw new RuntimeException(
                    "Stock insuffisant pour « {$locked->sku} » : {$before} en stock, ".abs($quantity).' demandé(s).'
                );
            }

            // En entrée avec un coût connu, on met à jour le prix de revient
            // moyen pondéré avant d'écrire la nouvelle quantité.
            if ($quantity > 0 && $unitCost !== null) {
                $locked->cost_price = $this->weightedAverageCost($before, $locked->cost_price, $quantity, $unitCost);
            }

            $locked->stock_quantity = $after;
            $locked->save();

            $variant->setRawAttributes($locked->getAttributes(), true);

            return StockMovement::create([
                'product_variant_id' => $locked->id,
                'type' => ($type ?? $this->typeFor($quantity, $reason))->value,
                'reason' => $reason->value,
                'quantity' => $quantity,
                'quantity_before' => $before,
                'quantity_after' => $after,
                'unit_cost' => $unitCost ?? $locked->cost_price,
                'reference_type' => $reference ? $reference::class : null,
                'reference_id' => $reference?->getKey(),
                'user_id' => $userId ?? Auth::id(),
                'note' => $note,
            ]);
        });
    }

    /**
     * Cale le stock sur une quantité comptée (inventaire physique).
     * Ne crée un mouvement que s'il y a un écart.
     */
    public function setQuantity(
        ProductVariant $variant,
        int $countedQuantity,
        MovementReason $reason = MovementReason::Inventaire,
        ?string $note = null,
    ): ?StockMovement {
        $difference = $countedQuantity - $variant->stock_quantity;

        if ($difference === 0) {
            return null;
        }

        return $this->move(
            variant: $variant,
            quantity: $difference,
            reason: $reason,
            note: $note,
            type: MovementType::Ajustement,
        );
    }

    /**
     * Prix de revient moyen pondéré (PMP / CUMP).
     *
     * On mélange l'ancien stock valorisé à son coût et la marchandise qui
     * entre. Si le stock était vide ou négatif, le nouveau coût s'impose.
     */
    public function weightedAverageCost(int $currentQty, int $currentCost, int $incomingQty, int $incomingCost): int
    {
        if ($currentQty <= 0) {
            return $incomingCost;
        }

        $totalQty = $currentQty + $incomingQty;

        if ($totalQty <= 0) {
            return $incomingCost;
        }

        return (int) round((($currentQty * $currentCost) + ($incomingQty * $incomingCost)) / $totalQty);
    }

    /** Valeur totale du stock au prix de revient. */
    public function totalStockValue(): int
    {
        return (int) ProductVariant::query()
            ->where('stock_quantity', '>', 0)
            ->sum(DB::raw('stock_quantity * cost_price'));
    }

    /**
     * Etat du stock en quatre chiffres, pour l'en-tete du catalogue.
     *
     * Les valeurs monetaires ne sont calculees que pour le gerant : elles se
     * lisent sur le prix de revient, que le vendeur ne doit pas voir.
     *
     * @return array<string, int>
     */
    public function summary(bool $withValues): array
    {
        $summary = [
            'references' => ProductVariant::query()->active()->count(),
            'articles' => (int) ProductVariant::query()->active()->sum('stock_quantity'),
            'lowStock' => ProductVariant::query()->active()->lowStock()->where('stock_quantity', '>', 0)->count(),
            'outOfStock' => ProductVariant::query()->active()->where('stock_quantity', '<=', 0)->count(),
        ];

        if ($withValues) {
            $summary['stockValue'] = $this->totalStockValue();
            $summary['retailValue'] = $this->totalRetailValue();
            $summary['potentialMargin'] = $summary['retailValue'] - $summary['stockValue'];
        }

        return $summary;
    }

    /** Valeur totale du stock au prix de vente. */
    public function totalRetailValue(): int
    {
        return (int) ProductVariant::query()
            ->where('stock_quantity', '>', 0)
            ->sum(DB::raw('stock_quantity * selling_price'));
    }

    protected function typeFor(int $quantity, MovementReason $reason): MovementType
    {
        if (in_array($reason, [MovementReason::Inventaire, MovementReason::Correction], true)) {
            return MovementType::Ajustement;
        }

        return $quantity > 0 ? MovementType::Entree : MovementType::Sortie;
    }

    protected function negativeStockAllowed(): bool
    {
        return (bool) Setting::get('allow_negative_stock', false);
    }
}
