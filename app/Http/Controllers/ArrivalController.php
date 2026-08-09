<?php

namespace App\Http\Controllers;

use App\Enums\ArrivalStatus;
use App\Models\ActivityLog;
use App\Models\Arrival;
use App\Models\ArrivalItem;
use App\Models\ProductVariant;
use App\Models\Supplier;
use App\Services\ArrivalService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

class ArrivalController extends Controller
{
    public function __construct(private readonly ArrivalService $arrivals) {}

    public function index(Request $request): Response
    {
        $arrivals = Arrival::query()
            ->with('supplier:id,name')
            ->when($request->filled('recherche'), function ($q) use ($request) {
                $term = $request->string('recherche')->toString();
                $q->where('reference', 'like', "%{$term}%")
                    ->orWhereHas('supplier', fn ($s) => $s->where('name', 'like', "%{$term}%"));
            })
            ->when($request->filled('statut'), fn ($q) => $q->where('status', $request->string('statut')->toString()))
            ->when($request->filled('fournisseur'), fn ($q) => $q->where('supplier_id', $request->integer('fournisseur')))
            ->latest('arrival_date')
            ->latest('id')
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Arrival $arrival) => [
                'id' => $arrival->id,
                'reference' => $arrival->reference,
                'supplier' => $arrival->supplier?->name,
                'date' => $arrival->arrival_date?->toDateString(),
                'status' => $arrival->status->value,
                'statusLabel' => $arrival->status->label(),
                'quantity' => $arrival->total_quantity,
                'goodsCost' => $arrival->goods_cost,
                'extraCosts' => $arrival->extra_costs,
                'totalCost' => $arrival->total_cost,
                'currency' => $arrival->currency,
            ]);

        return Inertia::render('arrivages/index', [
            'arrivals' => $arrivals,
            'filters' => $request->only(['recherche', 'statut', 'fournisseur']),
            'suppliers' => Supplier::orderBy('name')->get(['id', 'name']),
            'statuses' => ArrivalStatus::options(),
            'totals' => [
                'received' => Arrival::received()->count(),
                'draft' => Arrival::where('status', ArrivalStatus::Brouillon->value)->count(),
                'investedThisYear' => (int) Arrival::received()
                    ->whereYear('arrival_date', now()->year)
                    ->sum('total_cost'),
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('arrivages/form', [
            'arrival' => null,
            'reference' => Arrival::nextReference(),
            'suppliers' => Supplier::active()->orderBy('name')->get(['id', 'name']),
            'variants' => $this->variantOptions(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateArrival($request);

        $arrival = $this->arrivals->create($validated['attributes'], $validated['lines']);

        ActivityLog::record('cree', "Arrivage {$arrival->reference} créé", $arrival);
        $this->toast('Arrivage enregistré en brouillon.');

        return to_route('arrivals.show', $arrival);
    }

    public function show(Arrival $arrival): Response
    {
        $arrival->load(['supplier', 'user:id,name', 'items.variant.product:id,name']);

        return Inertia::render('arrivages/show', [
            'arrival' => [
                'id' => $arrival->id,
                'reference' => $arrival->reference,
                'supplier' => $arrival->supplier?->name,
                'supplierPhone' => $arrival->supplier?->phone,
                'date' => $arrival->arrival_date?->toDateString(),
                'status' => $arrival->status->value,
                'statusLabel' => $arrival->status->label(),
                'currency' => $arrival->currency,
                'exchangeRate' => (float) $arrival->exchange_rate,
                'goodsCost' => $arrival->goods_cost,
                'shippingCost' => $arrival->shipping_cost,
                'customsCost' => $arrival->customs_cost,
                'otherCost' => $arrival->other_cost,
                'totalCost' => $arrival->total_cost,
                'totalQuantity' => $arrival->total_quantity,
                'notes' => $arrival->notes,
                'receivedAt' => $arrival->received_at?->toIso8601String(),
                'createdBy' => $arrival->user?->name,
                'canEdit' => $arrival->isDraft(),
            ],
            'items' => $arrival->items->map(fn (ArrivalItem $item) => [
                'id' => $item->id,
                'variantId' => $item->product_variant_id,
                'productId' => $item->variant?->product_id,
                'label' => $item->variant?->fullLabel(),
                'sku' => $item->variant?->sku,
                'quantity' => $item->quantity,
                'unitCost' => (float) $item->unit_cost,
                'unitCostXof' => $item->unit_cost_xof,
                'landedUnitCost' => $item->landed_unit_cost,
                'lineTotal' => $item->line_total,
                'sellingPrice' => $item->variant?->selling_price,
                'currentStock' => $item->variant?->stock_quantity,
            ])->all(),
            'summary' => $this->arrivals->summary($arrival),
        ]);
    }

    public function edit(Arrival $arrival): Response
    {
        abort_unless($arrival->isDraft(), 403, 'Un arrivage réceptionné ne peut plus être modifié.');

        $arrival->load('items.variant.product:id,name');

        return Inertia::render('arrivages/form', [
            'arrival' => [
                'id' => $arrival->id,
                'reference' => $arrival->reference,
                'supplier_id' => $arrival->supplier_id,
                'arrival_date' => $arrival->arrival_date?->toDateString(),
                'currency' => $arrival->currency,
                'exchange_rate' => (float) $arrival->exchange_rate,
                'shipping_cost' => $arrival->shipping_cost,
                'customs_cost' => $arrival->customs_cost,
                'other_cost' => $arrival->other_cost,
                'notes' => $arrival->notes,
                'lines' => $arrival->items->map(fn (ArrivalItem $item) => [
                    'product_variant_id' => $item->product_variant_id,
                    'label' => $item->variant?->fullLabel(),
                    'sku' => $item->variant?->sku,
                    'quantity' => $item->quantity,
                    'unit_cost' => (float) $item->unit_cost,
                ])->all(),
            ],
            'reference' => $arrival->reference,
            'suppliers' => Supplier::active()->orderBy('name')->get(['id', 'name']),
            'variants' => $this->variantOptions(),
        ]);
    }

    public function update(Request $request, Arrival $arrival): RedirectResponse
    {
        abort_unless($arrival->isDraft(), 403, 'Un arrivage réceptionné ne peut plus être modifié.');

        $validated = $this->validateArrival($request);

        $arrival->update($validated['attributes']);
        $this->arrivals->syncItems($arrival, $validated['lines']);

        ActivityLog::record('modifie', "Arrivage {$arrival->reference} modifié", $arrival);
        $this->toast('Arrivage mis à jour.');

        return to_route('arrivals.show', $arrival);
    }

    /** Réception : entrée en stock et mise à jour des prix de revient. */
    public function receive(Arrival $arrival): RedirectResponse
    {
        try {
            $this->arrivals->receive($arrival);
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        ActivityLog::record('reception', "Arrivage {$arrival->reference} réceptionné", $arrival);
        $this->toast("Arrivage {$arrival->reference} réceptionné : stock et prix de revient mis à jour.");

        return back();
    }

    public function destroy(Arrival $arrival): RedirectResponse
    {
        abort_unless($arrival->isDraft(), 403, 'Un arrivage réceptionné ne peut pas être supprimé.');

        $reference = $arrival->reference;
        $arrival->delete();

        ActivityLog::record('supprime', "Arrivage {$reference} supprimé");
        $this->toast('Arrivage supprimé.');

        return to_route('arrivals.index');
    }

    /** @return array{attributes: array<string, mixed>, lines: array<int, array<string, mixed>>} */
    protected function validateArrival(Request $request): array
    {
        $validated = $request->validate([
            'supplier_id' => ['nullable', 'exists:suppliers,id'],
            'arrival_date' => ['required', 'date'],
            'currency' => ['required', 'string', 'max:8'],
            'exchange_rate' => ['required', 'numeric', 'min:0.000001'],
            'shipping_cost' => ['nullable', 'integer', 'min:0'],
            'customs_cost' => ['nullable', 'integer', 'min:0'],
            'other_cost' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_variant_id' => ['required', 'exists:product_variants,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'lines.*.unit_cost' => ['required', 'numeric', 'min:0'],
        ], [
            'lines.required' => 'Ajoutez au moins un article à l’arrivage.',
        ]);

        return [
            'attributes' => [
                'supplier_id' => $validated['supplier_id'] ?? null,
                'arrival_date' => $validated['arrival_date'],
                'currency' => strtoupper($validated['currency']),
                'exchange_rate' => $validated['exchange_rate'],
                'shipping_cost' => $validated['shipping_cost'] ?? 0,
                'customs_cost' => $validated['customs_cost'] ?? 0,
                'other_cost' => $validated['other_cost'] ?? 0,
                'notes' => $validated['notes'] ?? null,
            ],
            'lines' => $validated['lines'],
        ];
    }

    /**
     * Liste allégée des variantes, pour le sélecteur d'articles du formulaire.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function variantOptions(): array
    {
        return ProductVariant::query()
            ->with('product:id,name')
            ->active()
            ->orderBy('product_id')
            ->orderBy('position')
            ->get()
            ->map(fn (ProductVariant $v) => [
                'id' => $v->id,
                'label' => $v->fullLabel(),
                'sku' => $v->sku,
                'barcode' => $v->barcode,
                'costPrice' => $v->cost_price,
                'sellingPrice' => $v->selling_price,
                'stock' => $v->stock_quantity,
            ])
            ->all();
    }
}
