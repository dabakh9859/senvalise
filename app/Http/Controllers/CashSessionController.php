<?php

namespace App\Http\Controllers;

use App\Enums\CashCategory;
use App\Enums\CashDirection;
use App\Enums\CashSessionStatus;
use App\Enums\PaymentMethod;
use App\Models\CashMovement;
use App\Models\CashSession;
use App\Models\Sale;
use App\Models\Supplier;
use App\Services\CashSessionService;
use App\Support\Money;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * Le tiroir-caisse : ouverture le matin, achats et depenses dans la journee,
 * comptage le soir.
 *
 * A ne pas confondre avec l'ecran « Vente », qui encaisse les clients. Ici on
 * ne vend rien : on suit l'argent.
 */
class CashSessionController extends Controller
{
    public function __construct(private readonly CashSessionService $cash) {}

    public function index(Request $request): Response
    {
        $session = CashSession::current();
        $isGerant = $request->user('web')->isGerant();

        return Inertia::render('caisse/index', [
            'session' => $session ? $this->present($session) : null,
            'history' => $this->history(),
            'categories' => CashCategory::options(),
            'paymentMethods' => PaymentMethod::options(),
            'suppliers' => Supplier::query()->orderBy('name')->get(['id', 'name'])
                ->map(fn (Supplier $s) => ['id' => $s->id, 'name' => $s->name]),
            'canManage' => $isGerant,
        ]);
    }

    public function open(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'opening_float' => ['required', 'integer', 'min:0'],
            'opening_note' => ['nullable', 'string', 'max:500'],
        ], [
            'opening_float.required' => 'Indiquez le fond de caisse du matin.',
        ]);

        try {
            $session = $this->cash->open($validated['opening_float'], $validated['opening_note'] ?? null);
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast("Caisse {$session->reference} ouverte.");

        return back();
    }

    public function close(Request $request, CashSession $session): RedirectResponse
    {
        $validated = $request->validate([
            'counted_cash' => ['required', 'integer', 'min:0'],
            'closing_note' => ['nullable', 'string', 'max:500'],
        ], [
            'counted_cash.required' => 'Comptez le tiroir avant de fermer.',
        ]);

        try {
            $closed = $this->cash->close($session, $validated['counted_cash'], $validated['closing_note'] ?? null);
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $variance = $closed->variance ?? 0;
        $this->toast(
            $variance === 0
                ? "Caisse {$closed->reference} fermée, tiroir juste."
                : "Caisse {$closed->reference} fermée, écart de ".Money::format($variance).'.',
            $variance === 0 ? 'success' : 'error',
        );

        return back();
    }

    public function show(CashSession $session): Response
    {
        return Inertia::render('caisse/show', [
            'session' => $this->present($session, full: true),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Presentation
    |--------------------------------------------------------------------------
    */

    /** @return array<string, mixed> */
    protected function present(CashSession $session, bool $full = false): array
    {
        $session->loadMissing(['opener:id,name', 'closer:id,name']);

        $sales = $session->salesQuery()->get(['id', 'reference', 'total', 'amount_paid', 'payment_method', 'sold_at']);
        $movements = $session->movements()->with(['user:id,name', 'supplier:id,name'])->latest('occurred_at')->get();

        $cashSales = $session->cashFromSales();
        $expected = $session->isOpen() ? $session->expectedCash() : (int) $session->expected_cash;

        return [
            'id' => $session->id,
            'reference' => $session->reference,
            'status' => $session->status->value,
            'statusLabel' => $session->status->label(),
            'openedAt' => $session->opened_at->toIso8601String(),
            'openedBy' => $session->opener?->name,
            'openingFloat' => $session->opening_float,
            'openingNote' => $session->opening_note,
            'closedAt' => $session->closed_at?->toIso8601String(),
            'closedBy' => $session->closer?->name,
            'countedCash' => $session->counted_cash,
            'variance' => $session->variance,
            'closingNote' => $session->closing_note,

            'expectedCash' => $expected,
            'cashSales' => $cashSales,
            'salesTotal' => (int) $sales->sum('total'),
            'salesCount' => $sales->count(),
            'byMethod' => $this->byMethod($sales),

            'outgoing' => (int) $movements
                ->filter(fn (CashMovement $m) => $m->direction === CashDirection::Sortie)
                ->sum('amount'),
            'incoming' => (int) $movements
                ->filter(fn (CashMovement $m) => $m->direction === CashDirection::Entree)
                ->sum('amount'),
            'purchases' => (int) $movements
                ->filter(fn (CashMovement $m) => $m->category->isPurchase())
                ->sum('amount'),

            'movements' => $movements->map(fn (CashMovement $m) => $this->movementRow($m))->values()->all(),
            'sales' => $full
                ? $sales->map(fn (Sale $s) => [
                    'id' => $s->id,
                    'reference' => $s->reference,
                    'total' => $s->total,
                    'paymentMethod' => $s->payment_method->label(),
                    'soldAt' => $s->sold_at?->toIso8601String(),
                ])->all()
                : [],
        ];
    }

    /** @return array<string, mixed> */
    protected function movementRow(CashMovement $movement): array
    {
        return [
            'id' => $movement->id,
            'direction' => $movement->direction->value,
            'category' => $movement->category->value,
            'categoryLabel' => $movement->category->label(),
            'isPurchase' => $movement->category->isPurchase(),
            'label' => $movement->label,
            'amount' => $movement->amount,
            'paymentMethod' => $movement->payment_method->value,
            'paymentLabel' => $movement->payment_method->label(),
            'cashImpact' => $movement->cashImpact(),
            'supplier' => $movement->supplier?->name,
            'user' => $movement->user?->name,
            'occurredAt' => $movement->occurred_at->toIso8601String(),
            'note' => $movement->note,
        ];
    }

    /**
     * Repartition des encaissements par moyen de paiement : c'est ce qui permet
     * de rapprocher le tiroir du releve Wave ou Orange Money.
     *
     * @param  Collection<int, Sale>  $sales
     * @return array<int, array<string, mixed>>
     */
    protected function byMethod(Collection $sales): array
    {
        return $sales
            ->groupBy(fn (Sale $sale) => $sale->payment_method->value)
            ->map(fn ($group, $method) => [
                'method' => $method,
                'label' => PaymentMethod::from((string) $method)->label(),
                'count' => $group->count(),
                'total' => (int) $group->sum('total'),
            ])
            ->values()
            ->all();
    }

    /**
     * Les dernieres caisses fermees, pour comparer les ecarts d'un jour a l'autre.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function history(int $limit = 10): array
    {
        return CashSession::query()
            ->where('status', CashSessionStatus::Fermee)
            ->with(['opener:id,name', 'closer:id,name'])
            ->latest('opened_at')
            ->limit($limit)
            ->get()
            ->map(fn (CashSession $s) => [
                'id' => $s->id,
                'reference' => $s->reference,
                'openedAt' => $s->opened_at->toIso8601String(),
                'closedAt' => $s->closed_at?->toIso8601String(),
                'openedBy' => $s->opener?->name,
                'closedBy' => $s->closer?->name,
                'expectedCash' => $s->expected_cash,
                'countedCash' => $s->counted_cash,
                'variance' => $s->variance,
            ])
            ->all();
    }
}
