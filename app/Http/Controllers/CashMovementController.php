<?php

namespace App\Http\Controllers;

use App\Enums\CashCategory;
use App\Enums\CashDirection;
use App\Enums\PaymentMethod;
use App\Models\CashMovement;
use App\Models\CashSession;
use App\Models\Supplier;
use App\Services\CashSessionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * Les achats et depenses du jour.
 *
 * L'ecran est cale sur une journee et non sur une session de caisse : on veut
 * pouvoir saisir la facture d'electricite un jour ou personne n'a ouvert le
 * tiroir, et relire les achats d'hier sans rouvrir la caisse d'hier.
 */
class CashMovementController extends Controller
{
    public function __construct(private readonly CashSessionService $cash) {}

    public function index(Request $request): Response
    {
        $day = $this->day($request);

        $movements = CashMovement::query()
            ->with(['user:id,name', 'supplier:id,name'])
            ->onDay($day)
            ->orderByDesc('occurred_at')
            ->get();

        $outgoing = $movements->filter(fn (CashMovement $m) => $m->direction === CashDirection::Sortie);
        $incoming = $movements->filter(fn (CashMovement $m) => $m->direction === CashDirection::Entree);

        return Inertia::render('achats/index', [
            'day' => $day->toDateString(),
            'dayLabel' => $day->translatedFormat('l j F Y'),
            'isToday' => $day->isToday(),
            'movements' => $movements->map(fn (CashMovement $m) => $this->row($m))->values()->all(),
            'totals' => [
                'outgoing' => (int) $outgoing->sum('amount'),
                'incoming' => (int) $incoming->sum('amount'),
                'purchases' => (int) $outgoing->filter(fn (CashMovement $m) => $m->category->isPurchase())->sum('amount'),
                'cashImpact' => (int) $movements->sum(fn (CashMovement $m) => $m->cashImpact()),
            ],
            'byCategory' => $this->byCategory($outgoing),
            'month' => $this->monthToDate($day),
            'categories' => CashCategory::options(),
            'paymentMethods' => PaymentMethod::options(),
            'suppliers' => Supplier::query()->orderBy('name')->get(['id', 'name'])
                ->map(fn (Supplier $s) => ['id' => $s->id, 'name' => $s->name]),
            'hasOpenSession' => CashSession::current() !== null,
            'canManage' => $request->user('web')->isGerant(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'category' => ['required', 'string', 'in:'.implode(',', array_column(CashCategory::options(), 'value'))],
            'label' => ['required', 'string', 'max:180'],
            'amount' => ['required', 'integer', 'min:1'],
            'payment_method' => ['required', 'string', 'in:'.implode(',', array_column(PaymentMethod::options(), 'value'))],
            'supplier_id' => ['nullable', 'exists:suppliers,id'],
            'occurred_at' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:500'],
        ], [
            'label.required' => 'Dites en deux mots à quoi correspond la dépense.',
            'amount.min' => 'Le montant doit être supérieur à zéro.',
        ]);

        try {
            $movement = $this->cash->record($validated);
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast(
            $movement->direction === CashDirection::Sortie
                ? 'Dépense enregistrée.'
                : 'Entrée enregistrée.'
        );

        return back();
    }

    /**
     * Suppression reservee au gerant : effacer une depense fait bouger l'ecart
     * d'une caisse deja fermee, c'est une correction de comptabilite.
     */
    public function destroy(CashMovement $movement): RedirectResponse
    {
        $movement->delete();

        $this->toast('Mouvement supprimé.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Assistants
    |--------------------------------------------------------------------------
    */

    protected function day(Request $request): Carbon
    {
        $raw = $request->string('jour')->toString();

        try {
            return $raw !== '' ? Carbon::parse($raw)->startOfDay() : Carbon::today();
        } catch (\Throwable) {
            return Carbon::today();
        }
    }

    /** @return array<string, mixed> */
    protected function row(CashMovement $movement): array
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
     * @param  Collection<int, CashMovement>  $outgoing
     * @return array<int, array<string, mixed>>
     */
    protected function byCategory(Collection $outgoing): array
    {
        return $outgoing
            ->groupBy(fn (CashMovement $m) => $m->category->value)
            ->map(fn ($group, $key) => [
                'key' => (string) $key,
                'label' => CashCategory::from((string) $key)->label(),
                'total' => (int) $group->sum('amount'),
                'count' => $group->count(),
            ])
            ->sortByDesc('total')
            ->values()
            ->all();
    }

    /**
     * Cumul depuis le premier du mois : une depense se juge sur le mois, pas
     * sur la journee ou elle tombe.
     *
     * @return array<string, mixed>
     */
    protected function monthToDate(Carbon $day): array
    {
        $movements = CashMovement::query()
            ->whereBetween('occurred_at', [$day->copy()->startOfMonth(), $day->copy()->endOfDay()])
            ->get(['direction', 'category', 'amount']);

        return [
            'label' => $day->translatedFormat('F Y'),
            'outgoing' => (int) $movements
                ->filter(fn (CashMovement $m) => $m->direction === CashDirection::Sortie)
                ->sum('amount'),
            'purchases' => (int) $movements
                ->filter(fn (CashMovement $m) => $m->category->isPurchase())
                ->sum('amount'),
        ];
    }
}
