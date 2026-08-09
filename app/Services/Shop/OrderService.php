<?php

namespace App\Services\Shop;

use App\Enums\MovementReason;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\SaleChannel;
use App\Enums\SaleStatus;
use App\Enums\VaultStatus;
use App\Models\Customer;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Vault;
use App\Services\StockService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Cycle de vie d'une commande en ligne.
 *
 * Trois moments, trois effets sur le stock :
 *
 * 1. **À la commande**, la marchandise est *réservée* : elle reste au rayon
 *    mais n'est plus vendable au comptoir. Rien ne sort encore, parce que rien
 *    n'est encore payé ni vérifié.
 * 2. **À la confirmation**, la réserve devient une vente : le stock sort pour
 *    de bon, un ticket est créé, et la commande rejoint le chiffre d'affaires.
 *    C'est ce passage qui relie la boutique en ligne à la caisse.
 * 3. **À l'annulation**, on défait exactement ce qui avait été fait — la
 *    réserve seule si la commande n'était pas confirmée, la vente entière
 *    sinon.
 *
 * Sans cette distinction, une commande annulée aurait déjà fait disparaître la
 * marchandise du rayon et faussé la marge du mois.
 */
class OrderService
{
    public function __construct(
        private readonly StockService $stock,
        private readonly CartService $cart,
    ) {}

    /**
     * Enregistre une commande à partir du panier.
     *
     * @param  array<string, mixed>  $details  Coordonnées de livraison.
     */
    public function place(
        array $details,
        ?Customer $customer = null,
        ?DeliveryZone $zone = null,
        ?Vault $vault = null,
    ): Order {
        $contents = $this->cart->contents();

        if ($contents['lines'] === []) {
            throw new RuntimeException('Votre panier est vide.');
        }

        return DB::transaction(function () use ($contents, $details, $customer, $zone, $vault): Order {
            $subtotal = 0;
            $prepared = [];

            foreach ($contents['lines'] as $line) {
                // On relit le stock sous verrou : deux clients peuvent viser
                // la dernière valise à la même seconde.
                $variant = ProductVariant::whereKey($line['variantId'])->lockForUpdate()->first();

                if (! $variant) {
                    throw new RuntimeException('Un article de votre panier n’existe plus.');
                }

                if ($variant->available_quantity < $line['quantity']) {
                    throw new RuntimeException(
                        "« {$variant->fullLabel()} » n’est plus disponible en quantité suffisante.",
                    );
                }

                $price = $this->cart->price($variant);
                $lineTotal = $price * $line['quantity'];
                $subtotal += $lineTotal;

                $prepared[] = [
                    'variant' => $variant,
                    'quantity' => $line['quantity'],
                    'unit_price' => $price,
                    'line_total' => $lineTotal,
                ];
            }

            $deliveryFee = $zone !== null ? $zone->fee : 0;
            $total = $subtotal + $deliveryFee;

            if ($vault !== null) {
                $this->assertVaultCovers($vault, $total, $customer);
            }

            $order = Order::create([
                'reference' => Order::nextReference(),
                'tracking_token' => (string) Str::uuid(),
                'customer_id' => $customer?->id,
                'delivery_zone_id' => $zone?->id,
                'vault_id' => $vault?->id,
                'customer_name' => $details['customer_name'],
                'customer_phone' => $details['customer_phone'],
                'customer_email' => $details['customer_email'] ?? null,
                'delivery_address' => $details['delivery_address'],
                'delivery_city' => $details['delivery_city'] ?? $zone?->city,
                'delivery_note' => $details['delivery_note'] ?? null,
                // Figée à la commande : le client peut déménager ensuite, le
                // livreur de l'époque doit retrouver la bonne porte.
                'latitude' => $details['latitude'] ?? null,
                'longitude' => $details['longitude'] ?? null,
                'location_accuracy' => $details['location_accuracy'] ?? null,
                'located_at' => isset($details['latitude']) ? now() : null,
                'subtotal' => $subtotal,
                'delivery_fee' => $deliveryFee,
                'discount' => 0,
                'total' => $total,
                // Un coffre couvre la commande d'avance : elle est déjà payée.
                'amount_paid' => $vault !== null ? $total : 0,
                'status' => OrderStatus::EnAttente->value,
                'payment_method' => $vault !== null
                    ? PaymentMethod::Especes->value
                    : ($details['payment_method'] ?? PaymentMethod::Especes->value),
                'note' => $details['note'] ?? null,
                'placed_at' => now(),
            ]);

            foreach ($prepared as $line) {
                /** @var ProductVariant $variant */
                $variant = $line['variant'];

                OrderItem::create([
                    'order_id' => $order->id,
                    'product_variant_id' => $variant->id,
                    'designation' => $variant->fullLabel(),
                    'sku' => $variant->sku,
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'line_total' => $line['line_total'],
                ]);

                // Réservation : la quantité reste en stock mais n'est plus
                // vendable au comptoir.
                $variant->increment('reserved_quantity', $line['quantity']);
            }

            if ($vault !== null) {
                $vault->forceFill([
                    'status' => VaultStatus::Utilise->value,
                    'closed_at' => now(),
                ])->save();
            }

            $this->cart->clear();

            return $order->fresh(['items']) ?? $order;
        });
    }

    /**
     * Confirme la commande : la réserve devient une vente.
     *
     * C'est ici que la boutique en ligne rejoint la caisse — même table de
     * ventes, même mouvements de stock, même chiffre d'affaires. Une commande
     * confirmée n'est plus une promesse.
     */
    public function confirm(Order $order): Order
    {
        if ($order->status !== OrderStatus::EnAttente) {
            throw new RuntimeException('Seule une commande en attente peut être confirmée.');
        }

        return DB::transaction(function () use ($order): Order {
            $sale = Sale::create([
                'reference' => Sale::nextReference(),
                'channel' => SaleChannel::EnLigne->value,
                'customer_id' => $order->customer_id,
                'sold_at' => now(),
                'subtotal' => $order->subtotal,
                'discount' => $order->discount,
                'total' => $order->total,
                'amount_paid' => $order->amount_paid,
                'change_due' => 0,
                'total_cost' => 0,
                'payment_method' => $order->payment_method->value,
                'status' => SaleStatus::Validee->value,
                'note' => "Commande en ligne {$order->reference}",
            ]);

            $totalCost = 0;

            foreach ($order->items as $item) {
                $variant = $item->variant;

                if ($variant) {
                    // La réserve est levée avant la sortie, sinon le contrôle
                    // de disponibilité compterait deux fois la même quantité.
                    $variant->decrement('reserved_quantity', min($item->quantity, $variant->reserved_quantity));

                    $this->stock->move(
                        variant: $variant->fresh() ?? $variant,
                        quantity: -$item->quantity,
                        reason: MovementReason::Vente,
                        reference: $sale,
                        note: "Commande {$order->reference}",
                    );

                    $totalCost += $variant->cost_price * $item->quantity;
                }

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'product_variant_id' => $item->product_variant_id,
                    'designation' => $item->designation,
                    'sku' => $item->sku,
                    'barcode' => $variant?->barcode,
                    'quantity' => $item->quantity,
                    'unit_price' => $item->unit_price,
                    'discount' => 0,
                    'line_total' => $item->line_total,
                    'unit_cost' => $variant !== null ? $variant->cost_price : 0,
                ]);
            }

            $sale->forceFill(['total_cost' => $totalCost])->save();

            $order->forceFill([
                'status' => OrderStatus::Confirmee->value,
                'sale_id' => $sale->id,
                'confirmed_at' => now(),
            ])->save();

            return $order;
        });
    }

    /** Avance la commande d'une étape (préparée, expédiée, livrée). */
    public function advance(Order $order, OrderStatus $status): Order
    {
        if ($order->status === OrderStatus::Annulee) {
            throw new RuntimeException('Cette commande est annulée.');
        }

        if ($status->step() <= $order->status->step()) {
            throw new RuntimeException('Une commande ne revient pas en arrière.');
        }

        // Passer directement à « prête » depuis « en attente » confirme au
        // passage : la marchandise doit être sortie avant d'être emballée.
        if ($order->status === OrderStatus::EnAttente) {
            $order = $this->confirm($order);
        }

        $order->forceFill([
            'status' => $status->value,
            'shipped_at' => $status === OrderStatus::Expediee ? now() : $order->shipped_at,
            'delivered_at' => $status === OrderStatus::Livree ? now() : $order->delivered_at,
            // Livrée et payée à la livraison : l'encaissement est acquis.
            'amount_paid' => $status === OrderStatus::Livree ? $order->total : $order->amount_paid,
        ])->save();

        if ($status === OrderStatus::Livree && $order->sale) {
            $order->sale->forceFill(['amount_paid' => $order->total])->save();
        }

        return $order;
    }

    /**
     * Annule la commande et défait exactement ce qui avait été fait.
     */
    public function cancel(Order $order, string $reason = 'Annulation'): Order
    {
        if ($order->status === OrderStatus::Annulee) {
            throw new RuntimeException('Cette commande est déjà annulée.');
        }

        if ($order->status === OrderStatus::Livree) {
            throw new RuntimeException('Une commande livrée ne s’annule pas : passez par un retour.');
        }

        return DB::transaction(function () use ($order, $reason): Order {
            if ($order->status->stockIsOut() && $order->sale) {
                // La marchandise était sortie : elle revient au rayon avec son
                // mouvement, et la vente est annulée.
                foreach ($order->items as $item) {
                    if ($item->variant) {
                        $this->stock->move(
                            variant: $item->variant,
                            quantity: $item->quantity,
                            reason: MovementReason::RetourClient,
                            reference: $order->sale,
                            note: "Annulation commande {$order->reference}",
                        );
                    }
                }

                $order->sale->forceFill([
                    'status' => SaleStatus::Annulee->value,
                    'note' => trim(($order->sale->note ?? '').' — annulée : '.$reason),
                ])->save();
            } else {
                // Simple réserve : on la lève, rien n'avait bougé.
                foreach ($order->items as $item) {
                    $variant = $item->variant;

                    if ($variant) {
                        $variant->decrement(
                            'reserved_quantity',
                            min($item->quantity, $variant->reserved_quantity),
                        );
                    }
                }
            }

            // Un coffre engagé sur une commande annulée redevient disponible.
            if ($order->vault) {
                $order->vault->forceFill([
                    'status' => VaultStatus::Atteint->value,
                    'closed_at' => null,
                ])->save();
            }

            $order->forceFill([
                'status' => OrderStatus::Annulee->value,
                'cancel_reason' => $reason,
                'cancelled_at' => now(),
            ])->save();

            return $order;
        });
    }

    protected function assertVaultCovers(Vault $vault, int $total, ?Customer $customer): void
    {
        if ($customer === null || $vault->customer_id !== $customer->id) {
            throw new RuntimeException('Ce coffre ne vous appartient pas.');
        }

        if (! $vault->isSpendable()) {
            throw new RuntimeException('Ce coffre n’a pas encore atteint son objectif.');
        }

        if ($vault->saved_amount < $total) {
            throw new RuntimeException(
                'Le montant du coffre ne couvre pas cette commande, frais de livraison compris.',
            );
        }
    }
}
