<?php

namespace App\Http\Controllers;

use App\Enums\MovementReason;
use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use App\Services\StockService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class StockController extends Controller
{
    public function __construct(private readonly StockService $stock) {}

    public function movements(Request $request): Response
    {
        $isGerant = $request->user('web')->isGerant();

        $movements = StockMovement::query()
            ->with(['variant:id,sku,product_id', 'variant.product:id,name', 'user:id,name'])
            ->when($request->filled('variante'), fn ($q) => $q->where('product_variant_id', $request->integer('variante')))
            ->when($request->filled('motif'), fn ($q) => $q->where('reason', $request->string('motif')->toString()))
            ->when($request->filled('du'), fn ($q) => $q->whereDate('created_at', '>=', $request->date('du')))
            ->when($request->filled('au'), fn ($q) => $q->whereDate('created_at', '<=', $request->date('au')))
            ->when($request->filled('recherche'), function ($q) use ($request) {
                $term = $request->string('recherche')->toString();

                $q->whereHas('variant', fn (Builder $v) => $v
                    ->where('sku', 'like', "%{$term}%")
                    ->orWhere('barcode', 'like', "%{$term}%")
                    ->orWhereHas('product', fn (Builder $p) => $p->where('name', 'like', "%{$term}%")));
            })
            ->latest('id')
            ->paginate(30)
            ->withQueryString()
            ->through(fn (StockMovement $movement) => array_filter([
                'id' => $movement->id,
                'date' => $movement->created_at?->toIso8601String(),
                'label' => $movement->variant?->product?->name.' — '.$movement->variant?->sku,
                'variantId' => $movement->product_variant_id,
                'type' => $movement->type->value,
                'typeLabel' => $movement->type->label(),
                'reason' => $movement->reason->value,
                'reasonLabel' => $movement->reason->label(),
                'quantity' => $movement->quantity,
                'before' => $movement->quantity_before,
                'after' => $movement->quantity_after,
                'user' => $movement->user?->name,
                'note' => $movement->note,
                'unitCost' => $isGerant ? $movement->unit_cost : null,
            ], fn ($v) => $v !== null));

        return Inertia::render('stock/mouvements', [
            'movements' => $movements,
            'filters' => $request->only(['recherche', 'motif', 'du', 'au', 'variante']),
            'reasons' => MovementReason::options(),
        ]);
    }

    /**
     * Ajustement manuel d'une variante : retour, casse, perte, correction.
     * La quantité saisie est toujours positive, c'est le motif qui donne le sens.
     */
    public function adjust(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'product_variant_id' => ['required', 'exists:product_variants,id'],
            'reason' => ['required', Rule::in(array_map(fn ($c) => $c->value, MovementReason::manualCases()))],
            'quantity' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $variant = ProductVariant::with('product')
            ->whereKey((int) $validated['product_variant_id'])
            ->firstOrFail();

        $reason = MovementReason::from($validated['reason']);

        // Le motif détermine le sens : un retour client entre en stock,
        // une casse en sort.
        $signed = $reason->defaultType()->value === 'entree'
            ? $validated['quantity']
            : -$validated['quantity'];

        try {
            $this->stock->move(
                variant: $variant,
                quantity: $signed,
                reason: $reason,
                note: $validated['note'] ?? null,
            );
        } catch (\RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        ActivityLog::record('stock', "{$reason->label()} de {$validated['quantity']} × {$variant->sku}", $variant);
        $this->toast('Mouvement de stock enregistré.');

        return back();
    }

    /** Feuille d'inventaire : on saisit le comptage réel, l'écart est calculé. */
    public function inventory(Request $request): Response
    {
        $variants = ProductVariant::query()
            ->with('product:id,name')
            ->active()
            ->search($request->string('recherche')->toString())
            ->when($request->filled('categorie'), fn ($q) => $q->whereHas(
                'product',
                fn ($p) => $p->where('category_id', $request->integer('categorie')),
            ))
            ->orderBy('product_id')
            ->orderBy('position')
            ->limit(300)
            ->get()
            ->map(fn (ProductVariant $variant) => [
                'id' => $variant->id,
                'label' => $variant->fullLabel(),
                'sku' => $variant->sku,
                'barcode' => $variant->barcode,
                'stock' => $variant->stock_quantity,
            ])
            ->all();

        return Inertia::render('stock/inventaire', [
            'variants' => $variants,
            'filters' => $request->only(['recherche', 'categorie']),
            'categories' => Category::orderBy('position')->get(['id', 'name']),
        ]);
    }

    public function storeInventory(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'counts' => ['required', 'array', 'min:1'],
            'counts.*.product_variant_id' => ['required', 'exists:product_variants,id'],
            'counts.*.counted' => ['required', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $note = $validated['note'] ?? 'Inventaire physique';
        $adjusted = 0;

        DB::transaction(function () use ($validated, $note, &$adjusted) {
            $variants = ProductVariant::whereIn(
                'id',
                array_column($validated['counts'], 'product_variant_id'),
            )->get()->keyBy('id');

            foreach ($validated['counts'] as $row) {
                $variant = $variants->get($row['product_variant_id']);

                if (! $variant) {
                    continue;
                }

                $movement = $this->stock->setQuantity($variant, (int) $row['counted'], note: $note);

                if ($movement) {
                    $adjusted++;
                }
            }
        });

        ActivityLog::record('inventaire', "Inventaire enregistré — {$adjusted} écart(s) corrigé(s)");

        $this->toast($adjusted === 0
            ? 'Inventaire enregistré : aucun écart constaté.'
            : "Inventaire enregistré : {$adjusted} écart(s) corrigé(s).");

        return to_route('stock.index');
    }

    /** @return array<string, int> */
}
