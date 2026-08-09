<?php

namespace App\Http\Controllers;

use App\Enums\OrderStatus;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Services\Shop\GeolocationService;
use App\Services\Shop\OrderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Les commandes en ligne, vues de la boutique.
 *
 * Confirmer une commande n'est pas un simple changement d'étiquette : c'est ce
 * qui crée la vente, sort le stock et fait entrer le montant dans le chiffre
 * d'affaires. D'où le passage obligé par [OrderService].
 */
class OrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly GeolocationService $geo,
    ) {}

    public function index(Request $request): Response
    {
        $query = Order::query()
            ->with(['items', 'zone:id,name', 'customer:id,name,company_name,type'])
            ->search($request->string('recherche')->toString())
            ->when($request->filled('statut'), fn ($q) => $q->where('status', $request->string('statut')->toString()))
            ->when($request->filled('zone'), fn ($q) => $q->where('delivery_zone_id', $request->integer('zone')))
            ->when($request->filled('du'), fn ($q) => $q->whereDate('placed_at', '>=', $request->date('du')))
            ->when($request->filled('au'), fn ($q) => $q->whereDate('placed_at', '<=', $request->date('au')));

        $counts = (clone $query)
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->toBase()
            ->pluck('total', 'status');

        return Inertia::render('commandes/index', [
            'orders' => $query->latest('placed_at')
                ->paginate(25)
                ->withQueryString()
                ->through(fn (Order $order) => $this->serialize($order)),
            'filters' => $request->only(['recherche', 'statut', 'zone', 'du', 'au']),
            'statuses' => OrderStatus::options(),
            'zones' => DeliveryZone::orderBy('name')->get(['id', 'name'])->all(),
            'totals' => [
                'pending' => (int) ($counts[OrderStatus::EnAttente->value] ?? 0),
                'inProgress' => (int) ($counts[OrderStatus::Confirmee->value] ?? 0)
                    + (int) ($counts[OrderStatus::Preparee->value] ?? 0)
                    + (int) ($counts[OrderStatus::Expediee->value] ?? 0),
                'delivered' => (int) ($counts[OrderStatus::Livree->value] ?? 0),
                'revenue' => (int) (clone $query)
                    ->whereNotIn('status', [OrderStatus::Annulee->value])
                    ->sum('total'),
            ],
        ]);
    }

    public function show(Order $order): Response
    {
        $order->load(['items.variant.product:id,name,slug', 'zone', 'customer', 'sale', 'vault']);

        return Inertia::render('commandes/show', [
            'order' => [
                ...$this->serialize($order),
                'email' => $order->customer_email,
                'address' => $order->delivery_address,
                'city' => $order->delivery_city,
                'deliveryNote' => $order->delivery_note,
                // Le point GPS partagé par le client : c'est ce qui amène le
                // livreur devant la bonne porte plutôt que dans le quartier.
                'hasLocation' => $order->hasLocation(),
                'mapUrl' => $order->hasLocation()
                    ? $this->geo->mapUrl((float) $order->latitude, (float) $order->longitude)
                    : null,
                'accuracyLabel' => $this->geo->accuracyLabel($order->location_accuracy),
                'coordinates' => $order->hasLocation()
                    ? number_format((float) $order->latitude, 5, ',', ' ')
                        .' / '.number_format((float) $order->longitude, 5, ',', ' ')
                    : null,
                'note' => $order->note,
                'cancelReason' => $order->cancel_reason,
                'subtotal' => $order->subtotal,
                'deliveryFee' => $order->delivery_fee,
                'amountPaid' => $order->amount_paid,
                'balanceDue' => $order->balance_due,
                'paymentLabel' => $order->payment_method->label(),
                'saleId' => $order->sale_id,
                'saleReference' => $order->sale?->reference,
                'vaultReference' => $order->vault?->reference,
                'customerId' => $order->customer_id,
                'trackingUrl' => $order->trackingUrl(),
                'confirmedAt' => $order->confirmed_at?->toIso8601String(),
                'shippedAt' => $order->shipped_at?->toIso8601String(),
                'deliveredAt' => $order->delivered_at?->toIso8601String(),
                'lines' => $order->items->map(fn ($item) => [
                    'designation' => $item->designation,
                    'sku' => $item->sku,
                    'productId' => $item->variant?->product_id,
                    'quantity' => $item->quantity,
                    'unitPrice' => $item->unit_price,
                    'lineTotal' => $item->line_total,
                ])->all(),
            ],
            'statuses' => OrderStatus::options(),
        ]);
    }

    /** Confirme, prépare, expédie ou marque livrée. */
    public function advance(Request $request, Order $order): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::enum(OrderStatus::class)],
        ]);

        $status = OrderStatus::from($validated['status']);

        try {
            $status === OrderStatus::Confirmee
                ? $this->orders->confirm($order)
                : $this->orders->advance($order, $status);
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast("Commande passée en « {$status->label()} ».");

        return back();
    }

    public function cancel(Request $request, Order $order): RedirectResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            $this->orders->cancel($order, $validated['reason'] ?: 'Annulation');
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast('Commande annulée, le stock est revenu au rayon.');

        return back();
    }

    /** @return array<string, mixed> */
    protected function serialize(Order $order): array
    {
        return [
            'id' => $order->id,
            'reference' => $order->reference,
            'status' => $order->status->value,
            'statusLabel' => $order->status->label(),
            'statusTone' => $order->status->tone(),
            'step' => $order->status->step(),
            'customerName' => $order->customer_name,
            'customerPhone' => $order->customer_phone,
            'customerLabel' => $order->customer?->displayName(),
            'zone' => $order->zone?->name,
            'total' => $order->total,
            'itemCount' => $order->item_count,
            'placedAt' => $order->placed_at?->toIso8601String(),
            'isPaid' => $order->balance_due === 0,
            'fromVault' => $order->vault_id !== null,
        ];
    }
}
