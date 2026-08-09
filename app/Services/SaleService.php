<?php

namespace App\Services;

use App\Enums\MovementReason;
use App\Enums\PaymentMethod;
use App\Enums\SaleChannel;
use App\Enums\SaleStatus;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Enregistrement des ventes (caisse boutique et, plus tard, commandes du site).
 *
 * Le prix de revient est figé ligne par ligne au moment de la vente : c'est ce
 * qui permet de calculer une marge juste même si le prix d'achat change plus
 * tard.
 */
class SaleService
{
    public function __construct(private readonly StockService $stock) {}

    /**
     * @param  array<int, array{product_variant_id: int, quantity: int, unit_price?: int, discount?: int}>  $lines
     * @param  array<string, mixed>  $attributes
     */
    public function create(array $lines, array $attributes = []): Sale
    {
        if ($lines === []) {
            throw new RuntimeException('Une vente doit contenir au moins un article.');
        }

        return DB::transaction(function () use ($lines, $attributes) {
            $prepared = $this->prepareLines($lines);

            $subtotal = array_sum(array_map(
                fn (array $l) => $l['unit_price'] * $l['quantity'],
                $prepared,
            ));
            $lineDiscounts = array_sum(array_column($prepared, 'discount'));
            $globalDiscount = max(0, (int) ($attributes['discount'] ?? 0));

            $total = max(0, $subtotal - $lineDiscounts - $globalDiscount);
            $totalCost = array_sum(array_map(
                fn (array $l) => $l['unit_cost'] * $l['quantity'],
                $prepared,
            ));

            $paymentMethod = $attributes['payment_method'] ?? PaymentMethod::Especes->value;
            $amountPaid = (int) ($attributes['amount_paid'] ?? $total);

            $sale = Sale::create([
                'reference' => Sale::nextReference(),
                'channel' => $attributes['channel'] ?? SaleChannel::Boutique->value,
                'customer_id' => $attributes['customer_id'] ?? null,
                'user_id' => $attributes['user_id'] ?? Auth::id(),
                'sold_at' => $attributes['sold_at'] ?? now(),
                'subtotal' => $subtotal,
                'discount' => $lineDiscounts + $globalDiscount,
                'total' => $total,
                'amount_paid' => $amountPaid,
                'change_due' => max(0, $amountPaid - $total),
                'total_cost' => $totalCost,
                'payment_method' => $paymentMethod,
                'status' => SaleStatus::Validee->value,
                'note' => $attributes['note'] ?? null,
            ]);

            foreach ($prepared as $line) {
                /** @var ProductVariant $variant */
                $variant = $line['variant'];

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'product_variant_id' => $variant->id,
                    'designation' => $line['designation'],
                    'sku' => $variant->sku,
                    'barcode' => $variant->barcode,
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'discount' => $line['discount'],
                    'line_total' => ($line['unit_price'] * $line['quantity']) - $line['discount'],
                    'unit_cost' => $line['unit_cost'],
                ]);

                $this->stock->move(
                    variant: $variant,
                    quantity: -$line['quantity'],
                    reason: MovementReason::Vente,
                    reference: $sale,
                    unitCost: $line['unit_cost'],
                    note: "Vente {$sale->reference}",
                );
            }

            return $sale->fresh(['items', 'customer', 'user']);
        });
    }

    /**
     * Annule une vente et remet les articles en stock.
     * La vente est conservée pour l'historique, seul son statut change.
     */
    public function cancel(Sale $sale, string $reason = 'Annulation'): Sale
    {
        if ($sale->status !== SaleStatus::Validee) {
            throw new RuntimeException('Seule une vente validée peut être annulée.');
        }

        return DB::transaction(function () use ($sale, $reason) {
            $sale->loadMissing('items.variant');

            foreach ($sale->items as $item) {
                if (! $item->variant || $item->quantity <= 0) {
                    continue;
                }

                $this->stock->move(
                    variant: $item->variant,
                    quantity: $item->quantity,
                    reason: MovementReason::RetourClient,
                    reference: $sale,
                    unitCost: $item->unit_cost,
                    note: "{$reason} — vente {$sale->reference}",
                );
            }

            $sale->forceFill(['status' => SaleStatus::Annulee->value])->save();

            return $sale->refresh();
        });
    }

    /**
     * Vérifie les lignes du panier, fige les prix et contrôle la disponibilité
     * avant d'écrire quoi que ce soit.
     *
     * @param  array<int, array<string, mixed>>  $lines
     * @return array<int, array{variant: ProductVariant, quantity: int, unit_price: int, discount: int, unit_cost: int, designation: string}>
     */
    protected function prepareLines(array $lines): array
    {
        // Regroupe les doublons : scanner deux fois le même article donne une
        // seule ligne de quantité 2, pas deux lignes de 1.
        $merged = [];

        foreach ($lines as $line) {
            $variantId = (int) ($line['product_variant_id'] ?? 0);
            $quantity = (int) ($line['quantity'] ?? 0);

            if ($variantId <= 0 || $quantity <= 0) {
                continue;
            }

            $key = $variantId.'-'.($line['unit_price'] ?? 'auto');

            if (isset($merged[$key])) {
                $merged[$key]['quantity'] += $quantity;
                $merged[$key]['discount'] += max(0, (int) ($line['discount'] ?? 0));

                continue;
            }

            $merged[$key] = [
                'product_variant_id' => $variantId,
                'quantity' => $quantity,
                'unit_price' => isset($line['unit_price']) ? (int) $line['unit_price'] : null,
                'discount' => max(0, (int) ($line['discount'] ?? 0)),
            ];
        }

        if ($merged === []) {
            throw new RuntimeException('Une vente doit contenir au moins un article.');
        }

        $variants = ProductVariant::query()
            ->with('product')
            ->whereIn('id', array_column($merged, 'product_variant_id'))
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        $prepared = [];

        foreach ($merged as $line) {
            /** @var ProductVariant|null $variant */
            $variant = $variants->get($line['product_variant_id']);

            if (! $variant) {
                throw new RuntimeException('Article introuvable (identifiant '.$line['product_variant_id'].').');
            }

            $unitPrice = $line['unit_price'] ?? $variant->selling_price;
            $lineGross = $unitPrice * $line['quantity'];

            if ($line['discount'] > $lineGross) {
                throw new RuntimeException("La remise sur « {$variant->sku} » dépasse le montant de la ligne.");
            }

            $prepared[] = [
                'variant' => $variant,
                'quantity' => $line['quantity'],
                'unit_price' => max(0, (int) $unitPrice),
                'discount' => $line['discount'],
                'unit_cost' => $variant->cost_price,
                'designation' => $variant->fullLabel(),
            ];
        }

        return $prepared;
    }
}
