<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Enums\SaleChannel;
use App\Enums\SaleStatus;
use App\Models\ActivityLog;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Setting;
use App\Models\User;
use App\Services\SaleService;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

class SaleController extends Controller
{
    public function __construct(private readonly SaleService $sales) {}

    public function index(Request $request): Response
    {
        $isGerant = $request->user('web')->isGerant();

        $query = Sale::query()
            ->with(['user:id,name', 'customer:id,name'])
            ->when($request->filled('recherche'), function ($q) use ($request) {
                $term = $request->string('recherche')->toString();
                $q->where(function ($sub) use ($term) {
                    $sub->where('reference', 'like', "%{$term}%")
                        ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$term}%")
                            ->orWhere('phone', 'like', "%{$term}%"));
                });
            })
            ->when($request->filled('statut'), fn ($q) => $q->where('status', $request->string('statut')->toString()))
            ->when($request->filled('paiement'), fn ($q) => $q->where('payment_method', $request->string('paiement')->toString()))
            ->when($request->filled('vendeur'), fn ($q) => $q->where('user_id', $request->integer('vendeur')))
            ->when($request->filled('du'), fn ($q) => $q->whereDate('sold_at', '>=', $request->date('du')))
            ->when($request->filled('au'), fn ($q) => $q->whereDate('sold_at', '<=', $request->date('au')));

        // Totaux sur l'ensemble du filtre, pas seulement la page affichée.
        $totals = (clone $query)->where('status', SaleStatus::Validee->value)
            ->selectRaw('count(*) as count, coalesce(sum(total), 0) as revenue, coalesce(sum(total_cost), 0) as cost')
            ->first();

        $sales = $query->latest('sold_at')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (Sale $sale) => array_filter([
                'id' => $sale->id,
                'reference' => $sale->reference,
                'soldAt' => $sale->sold_at?->toIso8601String(),
                'customer' => $sale->customer?->name,
                'seller' => $sale->user?->name,
                'total' => $sale->total,
                'itemCount' => $sale->items()->sum('quantity'),
                'paymentLabel' => $sale->payment_method->label(),
                'channelLabel' => $sale->channel->label(),
                'status' => $sale->status->value,
                'statusLabel' => $sale->status->label(),
                'profit' => $isGerant ? $sale->profit : null,
            ], fn ($v) => $v !== null));

        return Inertia::render('ventes/index', [
            'sales' => $sales,
            'filters' => $request->only(['recherche', 'statut', 'paiement', 'vendeur', 'du', 'au']),
            'totals' => array_filter([
                'count' => (int) ($totals->count ?? 0),
                'revenue' => (int) ($totals->revenue ?? 0),
                'margin' => $isGerant ? (int) (($totals->revenue ?? 0) - ($totals->cost ?? 0)) : null,
            ], fn ($v) => $v !== null),
            'sellers' => User::orderBy('name')->get(['id', 'name']),
            'statuses' => SaleStatus::options(),
            'paymentMethods' => PaymentMethod::options(),
            'channels' => SaleChannel::options(),
            'canCancel' => $isGerant,
        ]);
    }

    public function show(Request $request, Sale $sale): Response
    {
        $isGerant = $request->user('web')->isGerant();

        $sale->load(['items.variant:id,product_id', 'items.variant.product:id,name', 'customer', 'user:id,name', 'documents']);

        return Inertia::render('ventes/show', [
            'sale' => array_filter([
                'id' => $sale->id,
                'reference' => $sale->reference,
                'soldAt' => $sale->sold_at?->toIso8601String(),
                'subtotal' => $sale->subtotal,
                'discount' => $sale->discount,
                'total' => $sale->total,
                'amountPaid' => $sale->amount_paid,
                'changeDue' => $sale->change_due,
                'paymentMethod' => $sale->payment_method->value,
                'paymentLabel' => $sale->payment_method->label(),
                'channelLabel' => $sale->channel->label(),
                'status' => $sale->status->value,
                'statusLabel' => $sale->status->label(),
                'note' => $sale->note,
                'seller' => $sale->user?->name,
                'customer' => $sale->customer ? [
                    'id' => $sale->customer->id,
                    'name' => $sale->customer->displayName(),
                    'phone' => $sale->customer->phone,
                ] : null,
                'profit' => $isGerant ? $sale->profit : null,
                'totalCost' => $isGerant ? $sale->total_cost : null,
            ], fn ($v) => $v !== null),
            'items' => $sale->items->map(fn (SaleItem $item) => array_filter([
                'id' => $item->id,
                'designation' => $item->designation,
                'sku' => $item->sku,
                'quantity' => $item->quantity,
                'unitPrice' => $item->unit_price,
                'discount' => $item->discount,
                'lineTotal' => $item->line_total,
                'productId' => $item->variant?->product_id,
                'unitCost' => $isGerant ? $item->unit_cost : null,
                'profit' => $isGerant ? $item->profit : null,
            ], fn ($v) => $v !== null))->all(),
            'documents' => $sale->documents->map(fn ($doc) => [
                'id' => $doc->id,
                'type' => $doc->type->value,
                'typeLabel' => $doc->type->label(),
                'reference' => $doc->reference,
            ])->all(),
            'canCancel' => $isGerant && $sale->status === SaleStatus::Validee,
        ]);
    }

    /** Ticket de caisse — page HTML autonome, imprimable directement. */
    public function receipt(Sale $sale): View
    {
        $sale->load(['items', 'customer', 'user:id,name']);

        return view('print.receipt', [
            'sale' => $sale,
            'shop' => [
                'name' => Setting::get('shop_name', 'SenValise'),
                'phone' => Setting::get('shop_phone'),
                'address' => Setting::get('shop_address'),
                'footer' => Setting::get('receipt_footer'),
            ],
        ]);
    }

    public function cancel(Request $request, Sale $sale): RedirectResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            $this->sales->cancel($sale, $validated['reason'] ?? 'Annulation');
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        ActivityLog::record('annulation', "Vente {$sale->reference} annulée", $sale);
        $this->toast("Vente {$sale->reference} annulée, stock restitué.");

        return back();
    }
}
