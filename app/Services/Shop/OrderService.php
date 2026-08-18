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
                $variant = ProductVariant::query()->whereKey($line['variantId'])->first();

                if (! $variant) {
                    throw new RuntimeException('Un article de votre panier n’existe plus.');
                }

                // La réservation est une écriture conditionnelle : SQLite ne
                // possède pas de verrou de ligne SELECT FOR UPDATE, mais cette
                // opération atomique empêche tout de même deux paniers de
                // prendre le dernier article.
                $reserved = ProductVariant::query()
                    ->whereKey($variant->getKey())
                    ->where('is_active', true)
                    ->whereHas('product', fn ($query) => $query
                        ->where('is_active', true)
                        ->where('is_published', true))
                    ->whereRaw('stock_quantity - reserved_quantity >= ?', [$line['quantity']])
                    ->increment('reserved_quantity', $line['quantity']);

                if ($reserved !== 1) {
                    throw new RuntimeException(
                        "« {$variant->fullLabel()} » n’est plus disponible en quantité suffisante.",
                    );
                }

                $variant->refresh();

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
                $vault = $this->claimVault($vault, $total, $customer);
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
        return DB::transaction(function () use ($order): Order {
            $claimed = Order::query()
                ->whereKey($order->getKey())
                ->where('status', OrderStatus::EnAttente->value)
                ->update([
                    'status' => OrderStatus::Confirmee->value,
                    'confirmed_at' => now(),
                    'updated_at' => now(),
                ]);

            if ($claimed !== 1) {
                throw new RuntimeException('Seule une commande en attente peut être confirmée.');
            }

            $order = Order::query()
                ->with(['items.variant', 'customer'])
                ->whereKey($order->getKey())
                ->firstOrFail();

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
                'sale_id' => $sale->id,
            ])->save();

            return $order->refresh();
        });
    }

    /** Avance la commande d'une étape (préparée, expédiée, livrée). */
    public function advance(Order $order, OrderStatus $status): Order
    {
        return DB::transaction(function () use ($order, $status): Order {
            $order = Order::query()->whereKey($order->getKey())->firstOrFail();

            // Passer directement à « prête » depuis « en attente » confirme
            // au passage : la marchandise doit être sortie avant l'emballage.
            if ($order->status === OrderStatus::EnAttente) {
                $order = $this->confirm($order);
            }

            if ($status === OrderStatus::Confirmee) {
                return $order;
            }

            $allowed = collect(OrderStatus::cases())
                ->filter(fn (OrderStatus $candidate) => $candidate->step() >= OrderStatus::Confirmee->step()
                    && $candidate->step() < $status->step())
                ->map(fn (OrderStatus $candidate) => $candidate->value)
                ->all();

            $advanced = $allowed === [] ? 0 : Order::query()
                ->whereKey($order->getKey())
                ->whereIn('status', $allowed)
                ->update([
                    'status' => $status->value,
                    'shipped_at' => $status === OrderStatus::Expediee ? now() : $order->shipped_at,
                    'delivered_at' => $status === OrderStatus::Livree ? now() : $order->delivered_at,
                    'amount_paid' => $status === OrderStatus::Livree ? $order->total : $order->amount_paid,
                    'updated_at' => now(),
                ]);

            if ($advanced !== 1) {
                throw new RuntimeException('Cette étape est déjà dépassée ou la commande est fermée.');
            }

            $order = Order::query()
                ->with('sale')
                ->whereKey($order->getKey())
                ->firstOrFail();

            if ($status === OrderStatus::Livree && $order->sale) {
                $order->sale->forceFill(['amount_paid' => $order->total])->save();
            }

            return $order;
        });
    }

    /**
     * Annule la commande et défait exactement ce qui avait été fait.
     */
    public function cancel(Order $order, string $reason = 'Annulation'): Order
    {
        return DB::transaction(function () use ($order, $reason): Order {
            $previousStatus = null;

            foreach ([OrderStatus::EnAttente, OrderStatus::Confirmee, OrderStatus::Preparee, OrderStatus::Expediee] as $candidate) {
                $claimed = Order::query()
                    ->whereKey($order->getKey())
                    ->where('status', $candidate->value)
                    ->update([
                        'status' => OrderStatus::Annulee->value,
                        'cancel_reason' => $reason,
                        'cancelled_at' => now(),
                        'updated_at' => now(),
                    ]);

                if ($claimed === 1) {
                    $previousStatus = $candidate;

                    break;
                }
            }

            if ($previousStatus === null) {
                $current = Order::query()->whereKey($order->getKey())->firstOrFail();

                throw new RuntimeException($current->status === OrderStatus::Livree
                    ? 'Une commande livrée ne s’annule pas : passez par un retour.'
                    : 'Cette commande est déjà annulée.');
            }

            $order = Order::query()
                ->with(['items.variant', 'sale', 'vault'])
                ->whereKey($order->getKey())
                ->firstOrFail();

            if ($previousStatus->stockIsOut() && $order->sale) {
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

            return $order->refresh();
        });
    }

    protected function claimVault(Vault $vault, int $total, ?Customer $customer): Vault
    {
        if ($customer === null) {
            throw new RuntimeException('Connectez-vous pour utiliser un coffre.');
        }

        $claimed = Vault::query()
            ->whereKey($vault->getKey())
            ->where('customer_id', $customer->getKey())
            ->where('status', VaultStatus::Atteint->value)
            ->update([
                'status' => VaultStatus::Utilise->value,
                'closed_at' => now(),
                'updated_at' => now(),
            ]);

        if ($claimed !== 1) {
            throw new RuntimeException('Ce coffre ne vous appartient pas, est fermé ou n’a pas atteint son objectif.');
        }

        $vault = Vault::query()->whereKey($vault->getKey())->firstOrFail();

        if ($vault->saved_amount < $total) {
            throw new RuntimeException(
                'Le montant du coffre ne couvre pas cette commande, frais de livraison compris.',
            );
        }

        return $vault;
    }
}
