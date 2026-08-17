<?php

namespace App\Http\Controllers;

use App\Enums\RefundMethod;
use App\Enums\ReturnReason;
use App\Models\Customer;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SaleReturn;
use App\Services\ReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * Retours client.
 *
 * Le chemin normal part de la vente d'origine : on la retrouve par sa
 * reference, on coche ce qui revient, les prix pratiques ce jour-la sont
 * repris tels quels. Un retour sans ticket reste possible, prix saisi a la
 * main.
 */
class ReturnController extends Controller
{
    public function __construct(private readonly ReturnService $returns) {}

    public function index(Request $request): Response
    {
        $returns = SaleReturn::query()
            ->with(['customer:id,name,company_name', 'user:id,name', 'sale:id,reference', 'items'])
            ->when($request->string('recherche')->toString() !== '', function ($query) use ($request) {
                $term = $request->string('recherche')->toString();
                $query->where(function ($q) use ($term) {
                    $q->where('reference', 'like', "%{$term}%")
                        ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$term}%"))
                        ->orWhereHas('sale', fn ($s) => $s->where('reference', 'like', "%{$term}%"));
                });
            })
            ->when($request->string('motif')->toString() !== '',
                fn ($q) => $q->where('reason', $request->string('motif')->toString()))
            ->latest('returned_at')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (SaleReturn $return) => $this->row($return));

        return Inertia::render('retours/index', [
            'returns' => $returns,
            'filters' => $request->only(['recherche', 'motif']),
            'reasons' => ReturnReason::options(),
            'stats' => $this->stats(),
        ]);
    }

    public function create(Request $request): Response
    {
        return Inertia::render('retours/form', [
            'reasons' => ReturnReason::options(),
            'refundMethods' => RefundMethod::options(),
            'customers' => Customer::active()->orderBy('name')->limit(500)->get(['id', 'name', 'phone'])
                ->map(fn (Customer $c) => ['id' => $c->id, 'name' => $c->displayName(), 'phone' => $c->phone]),
            'prefill' => $request->filled('vente')
                ? $this->salePayload(Sale::where('reference', $request->string('vente')->toString())->first())
                : null,
        ]);
    }

    /** Recherche d'une vente par sa reference, pour pre-remplir le retour. */
    public function lookup(Request $request): JsonResponse
    {
        $term = $request->string('reference')->toString();

        if (strlen($term) < 3) {
            return response()->json(['sale' => null]);
        }

        $sale = Sale::query()
            ->where('reference', 'like', "%{$term}%")
            ->latest('sold_at')
            ->first();

        return response()->json(['sale' => $this->salePayload($sale)]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_variant_id' => ['nullable', 'exists:product_variants,id'],
            'lines.*.designation' => ['nullable', 'string', 'max:180'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'lines.*.unit_price' => ['required', 'integer', 'min:0'],
            'lines.*.restocked' => ['nullable', 'boolean'],
            'sale_id' => ['nullable', 'exists:sales,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'reason' => ['required', 'string', 'in:'.implode(',', array_column(ReturnReason::options(), 'value'))],
            'refund_method' => ['required', 'string', 'in:'.implode(',', array_column(RefundMethod::options(), 'value'))],
            'note' => ['nullable', 'string', 'max:500'],
        ], [
            'lines.required' => 'Ajoutez au moins un article au retour.',
        ]);

        try {
            $return = $this->returns->create($validated['lines'], $validated);
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast("Retour {$return->reference} enregistré.");

        return to_route('returns.show', $return);
    }

    public function show(SaleReturn $return): Response
    {
        $return->load(['customer', 'user:id,name', 'sale:id,reference,sold_at', 'items.variant.product:id,name']);

        return Inertia::render('retours/show', [
            'return' => [
                ...$this->row($return),
                'items' => $return->items->map(fn ($item) => [
                    'id' => $item->id,
                    'designation' => $item->designation,
                    'quantity' => $item->quantity,
                    'unitPrice' => $item->unit_price,
                    'lineTotal' => $item->line_total,
                    'restocked' => $item->restocked,
                    'variantId' => $item->product_variant_id,
                ])->all(),
                'note' => $return->note,
            ],
        ]);
    }

    /** Solde un avoir quand le client l'a consomme. */
    public function consume(SaleReturn $return): RedirectResponse
    {
        try {
            $this->returns->consumeCredit($return);
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast('Avoir marqué comme utilisé.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Presentation
    |--------------------------------------------------------------------------
    */

    /** @return array<string, mixed> */
    protected function row(SaleReturn $return): array
    {
        return [
            'id' => $return->id,
            'reference' => $return->reference,
            'returnedAt' => $return->returned_at->toIso8601String(),
            'customer' => $return->customer?->displayName(),
            'customerId' => $return->customer_id,
            'saleReference' => $return->sale?->reference,
            'saleId' => $return->sale_id,
            'reason' => $return->reason->value,
            'reasonLabel' => $return->reason->label(),
            'refundMethod' => $return->refund_method->value,
            'refundLabel' => $return->refund_method->label(),
            'totalRefund' => $return->total_refund,
            'itemCount' => (int) $return->items->sum('quantity'),
            'restockedCount' => (int) $return->items->where('restocked', true)->sum('quantity'),
            'isOpenCredit' => $return->isOpenCredit(),
            'creditUsedAt' => $return->credit_used_at?->toIso8601String(),
            'user' => $return->user?->name,
        ];
    }

    /** @return array<string, mixed>|null */
    protected function salePayload(?Sale $sale): ?array
    {
        if (! $sale) {
            return null;
        }

        $sale->load(['items.variant.product:id,name', 'customer']);

        // Ce qui a deja ete rendu sur cette vente, pour ne pas rembourser deux
        // fois le meme article.
        $already = SaleReturn::query()
            ->where('sale_id', $sale->id)
            ->with('items')
            ->get()
            ->flatMap(fn (SaleReturn $r) => $r->items)
            ->groupBy('product_variant_id')
            ->map(fn ($group) => (int) $group->sum('quantity'));

        return [
            'id' => $sale->id,
            'reference' => $sale->reference,
            'soldAt' => $sale->sold_at?->toIso8601String(),
            'customerId' => $sale->customer_id,
            'customer' => $sale->customer?->displayName(),
            'total' => $sale->total,
            'items' => $sale->items->map(function (SaleItem $item) use ($already) {
                $returned = (int) ($already[$item->product_variant_id] ?? 0);

                return [
                    'variantId' => $item->product_variant_id,
                    'designation' => $item->designation,
                    'quantity' => $item->quantity,
                    'alreadyReturned' => $returned,
                    'returnable' => max(0, $item->quantity - $returned),
                    'unitPrice' => $item->unit_price,
                ];
            })->all(),
        ];
    }

    /** @return array<string, mixed> */
    protected function stats(): array
    {
        $month = now()->startOfMonth();

        return [
            'monthCount' => SaleReturn::where('returned_at', '>=', $month)->count(),
            'monthRefund' => (int) SaleReturn::where('returned_at', '>=', $month)->sum('total_refund'),
            'openCredits' => (int) SaleReturn::openCredit()->sum('total_refund'),
            'openCreditCount' => SaleReturn::openCredit()->count(),
        ];
    }
}
