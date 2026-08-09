<?php

namespace App\Services;

use App\Enums\ArrivalStatus;
use App\Enums\MovementReason;
use App\Models\Arrival;
use App\Models\ArrivalItem;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Gestion des arrivages.
 *
 * L'intérêt principal : répartir les frais annexes (fret, douane, manutention)
 * sur les articles reçus, au prorata de leur valeur. Sans ça, le prix de
 * revient affiché est faux et la marge calculée sur les ventes est trop
 * optimiste.
 */
class ArrivalService
{
    public function __construct(private readonly StockService $stock) {}

    /**
     * Recalcule les totaux d'un arrivage à partir de ses lignes.
     * Appelé après chaque modification tant que l'arrivage est en brouillon.
     */
    public function recalculate(Arrival $arrival): Arrival
    {
        $arrival->loadMissing('items');

        $rate = (float) $arrival->exchange_rate ?: 1.0;

        $goodsCost = 0;
        $totalQuantity = 0;

        foreach ($arrival->items as $item) {
            $unitCostXof = (int) round((float) $item->unit_cost * $rate);
            $lineTotal = $unitCostXof * $item->quantity;

            $item->forceFill([
                'unit_cost_xof' => $unitCostXof,
                'line_total' => $lineTotal,
            ])->save();

            $goodsCost += $lineTotal;
            $totalQuantity += $item->quantity;
        }

        $extra = $arrival->shipping_cost + $arrival->customs_cost + $arrival->other_cost;

        $arrival->forceFill([
            'goods_cost' => $goodsCost,
            'total_cost' => $goodsCost + $extra,
            'total_quantity' => $totalQuantity,
        ])->save();

        return $this->allocateLandedCosts($arrival->fresh('items'));
    }

    /**
     * Répartit les frais annexes sur chaque ligne pour obtenir le prix de
     * revient rendu boutique.
     *
     * Répartition au prorata de la valeur des lignes. Si la marchandise est à
     * coût nul (échantillons, cadeaux), on bascule sur une répartition à la
     * quantité pour ne pas diviser par zéro.
     */
    public function allocateLandedCosts(Arrival $arrival): Arrival
    {
        $arrival->loadMissing('items');

        $extra = $arrival->shipping_cost + $arrival->customs_cost + $arrival->other_cost;
        $goodsCost = (int) $arrival->items->sum('line_total');
        $totalQuantity = (int) $arrival->items->sum('quantity');

        foreach ($arrival->items as $item) {
            if ($item->quantity <= 0) {
                $item->forceFill(['landed_unit_cost' => $item->unit_cost_xof])->save();

                continue;
            }

            $share = match (true) {
                $extra <= 0 => 0,
                $goodsCost > 0 => (int) round($extra * ($item->line_total / $goodsCost)),
                $totalQuantity > 0 => (int) round($extra * ($item->quantity / $totalQuantity)),
                default => 0,
            };

            $item->forceFill([
                'landed_unit_cost' => $item->unit_cost_xof + (int) round($share / $item->quantity),
            ])->save();
        }

        return $arrival;
    }

    /**
     * Réceptionne l'arrivage : entrée en stock de chaque ligne et mise à jour
     * du prix de revient moyen pondéré. Opération irréversible.
     */
    public function receive(Arrival $arrival): Arrival
    {
        if ($arrival->isReceived()) {
            throw new RuntimeException('Cet arrivage a déjà été réceptionné.');
        }

        $arrival->loadMissing('items.variant');

        if ($arrival->items->isEmpty()) {
            throw new RuntimeException('Impossible de réceptionner un arrivage sans aucune ligne.');
        }

        return DB::transaction(function () use ($arrival) {
            $this->recalculate($arrival);
            $arrival->refresh()->loadMissing('items.variant');

            foreach ($arrival->items as $item) {
                if ($item->quantity <= 0) {
                    continue;
                }

                $this->stock->move(
                    variant: $item->variant,
                    quantity: $item->quantity,
                    reason: MovementReason::Arrivage,
                    reference: $arrival,
                    unitCost: $item->landed_unit_cost,
                    note: "Arrivage {$arrival->reference}",
                );
            }

            $arrival->forceFill([
                'status' => ArrivalStatus::Receptionne->value,
                'received_at' => now(),
            ])->save();

            return $arrival->refresh();
        });
    }

    /**
     * Remplace les lignes d'un arrivage en brouillon.
     *
     * @param  array<int, array<string, mixed>>  $lines
     */
    public function syncItems(Arrival $arrival, array $lines): Arrival
    {
        if ($arrival->isReceived()) {
            throw new RuntimeException('Un arrivage réceptionné ne peut plus être modifié.');
        }

        return DB::transaction(function () use ($arrival, $lines) {
            $arrival->items()->delete();

            foreach ($lines as $line) {
                $variantId = (int) ($line['product_variant_id'] ?? 0);
                $quantity = (int) ($line['quantity'] ?? 0);

                if ($variantId <= 0 || $quantity <= 0) {
                    continue;
                }

                ArrivalItem::create([
                    'arrival_id' => $arrival->id,
                    'product_variant_id' => $variantId,
                    'quantity' => $quantity,
                    'unit_cost' => (float) ($line['unit_cost'] ?? 0),
                ]);
            }

            return $this->recalculate($arrival->fresh('items'));
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<int, array<string, mixed>>  $lines
     */
    public function create(array $attributes, array $lines = []): Arrival
    {
        return DB::transaction(function () use ($attributes, $lines) {
            $arrival = Arrival::create([
                ...$attributes,
                'reference' => $attributes['reference'] ?? Arrival::nextReference(),
                'user_id' => $attributes['user_id'] ?? Auth::id(),
                'status' => $attributes['status'] ?? ArrivalStatus::Brouillon->value,
            ]);

            return $this->syncItems($arrival, $lines);
        });
    }

    /**
     * Récapitulatif d'un arrivage : quantités, coûts et marge prévisionnelle
     * si tout est vendu au prix boutique actuel.
     *
     * @return array<string, int|float>
     */
    public function summary(Arrival $arrival): array
    {
        $arrival->loadMissing('items.variant');

        $expectedRevenue = 0;
        $landedTotal = 0;

        foreach ($arrival->items as $item) {
            $expectedRevenue += ($item->variant->selling_price ?? 0) * $item->quantity;
            $landedTotal += $item->landed_unit_cost * $item->quantity;
        }

        $extra = $arrival->shipping_cost + $arrival->customs_cost + $arrival->other_cost;

        return [
            'lines' => $arrival->items->count(),
            'total_quantity' => (int) $arrival->items->sum('quantity'),
            'goods_cost' => (int) $arrival->goods_cost,
            'extra_costs' => $extra,
            'total_cost' => (int) $arrival->total_cost,
            'landed_total' => $landedTotal,
            'expected_revenue' => $expectedRevenue,
            'expected_margin' => $expectedRevenue - $landedTotal,
            'expected_margin_rate' => $expectedRevenue > 0
                ? round((($expectedRevenue - $landedTotal) / $expectedRevenue) * 100, 1)
                : 0.0,
            'average_unit_cost' => ($q = (int) $arrival->items->sum('quantity')) > 0
                ? (int) round($landedTotal / $q)
                : 0,
        ];
    }
}
