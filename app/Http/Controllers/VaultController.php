<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Enums\VaultStatus;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Vault;
use App\Services\Shop\VaultService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Les coffres, côté boutique.
 *
 * C'est ici que le vendeur enregistre les versements reçus au comptoir :
 * l'application n'encaisse pas d'argent, elle tient le carnet. Chaque
 * versement porte le nom de qui l'a saisi — un solde contesté doit pouvoir se
 * remonter jusqu'à la personne qui a pris les billets.
 */
class VaultController extends Controller
{
    public function __construct(private readonly VaultService $vaults) {}

    public function index(Request $request): Response
    {
        $query = Vault::query()
            ->with(['customer:id,name,company_name,type,phone', 'variant.product:id,name'])
            ->when($request->filled('statut'), fn ($q) => $q->where('status', $request->string('statut')->toString()))
            ->when($request->filled('recherche'), function ($q) use ($request) {
                $term = $request->string('recherche')->toString();

                $q->where(fn ($w) => $w->where('reference', 'like', "%{$term}%")
                    ->orWhere('label', 'like', "%{$term}%")
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$term}%")
                        ->orWhere('phone', 'like', "%{$term}%")));
            });

        $vaults = $query->latest('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (Vault $vault) => $this->serialize($vault));

        $all = Vault::with('deposits')->get();

        return Inertia::render('coffres/index', [
            'vaults' => $vaults,
            'filters' => $request->only(['recherche', 'statut']),
            'statuses' => VaultStatus::options(),
            'paymentMethods' => PaymentMethod::options(),
            'customers' => Customer::active()
                ->orderBy('name')
                ->get(['id', 'name', 'company_name', 'type', 'phone'])
                ->map(fn (Customer $customer) => [
                    'id' => $customer->id,
                    'name' => $customer->displayName(),
                    'phone' => $customer->phone,
                ])
                ->all(),
            'articles' => ProductVariant::with('product:id,name')
                ->where('is_active', true)
                ->orderBy('sku')
                ->get()
                ->map(fn (ProductVariant $variant) => [
                    'id' => $variant->id,
                    'label' => $variant->fullLabel(),
                    'price' => $variant->web_price > 0 ? $variant->web_price : $variant->selling_price,
                ])
                ->all(),
            'totals' => [
                // L'argent des clients gardé par la boutique : une dette, pas
                // une recette. Le gérant doit l'avoir en tête.
                'held' => (int) $all
                    ->whereIn('status', [VaultStatus::Ouvert, VaultStatus::Atteint])
                    ->sum(fn (Vault $vault) => $vault->saved_amount),
                'open' => $all->where('status', VaultStatus::Ouvert)->count(),
                'reached' => $all->where('status', VaultStatus::Atteint)->count(),
            ],
        ]);
    }

    public function show(Vault $vault): Response
    {
        $vault->load(['customer', 'variant.product:id,name', 'deposits.user:id,name', 'orders']);

        return Inertia::render('coffres/show', [
            'vault' => [
                ...$this->serialize($vault),
                'note' => $vault->note,
                'reachedAt' => $vault->reached_at?->toIso8601String(),
                'closedAt' => $vault->closed_at?->toIso8601String(),
                'customerPhone' => $vault->customer?->phone,
                'customerId' => $vault->customer_id,
                'deposits' => $vault->deposits->map(fn ($deposit) => [
                    'id' => $deposit->id,
                    'amount' => $deposit->amount,
                    'method' => $deposit->payment_method->label(),
                    'reference' => $deposit->reference,
                    'note' => $deposit->note,
                    'user' => $deposit->user?->name,
                    'date' => $deposit->deposited_at?->toIso8601String(),
                ])->all(),
                'orders' => $vault->orders->map(fn ($order) => [
                    'id' => $order->id,
                    'reference' => $order->reference,
                    'total' => $order->total,
                    'statusLabel' => $order->status->label(),
                ])->all(),
            ],
            'paymentMethods' => PaymentMethod::options(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'label' => ['required', 'string', 'max:120'],
            'target_amount' => ['required', 'integer', 'min:1000'],
            'product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $customer = Customer::whereKey((int) $validated['customer_id'])->first();

        if (! $customer) {
            $this->toast('Client introuvable.', 'error');

            return back();
        }

        try {
            $this->vaults->open(
                customer: $customer,
                label: $validated['label'],
                targetAmount: (int) $validated['target_amount'],
                variant: filled($validated['product_variant_id'] ?? null)
                    ? ProductVariant::whereKey((int) $validated['product_variant_id'])->first()
                    : null,
                note: $validated['note'] ?? null,
            );
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast('Coffre ouvert.');

        return back();
    }

    public function deposit(Request $request, Vault $vault): RedirectResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'integer', 'min:1'],
            'payment_method' => ['required', Rule::enum(PaymentMethod::class)],
            'reference' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            $this->vaults->deposit(
                vault: $vault,
                amount: (int) $validated['amount'],
                method: PaymentMethod::from($validated['payment_method']),
                reference: $validated['reference'] ?? null,
                note: $validated['note'] ?? null,
            );
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $fresh = $vault->fresh();

        $this->toast(
            $fresh?->status === VaultStatus::Atteint
                ? 'Versement enregistré — l’objectif est atteint !'
                : 'Versement enregistré.',
        );

        return back();
    }

    public function refund(Request $request, Vault $vault): RedirectResponse
    {
        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $this->vaults->refund($vault, $validated['note'] ?? null);
        $this->toast('Coffre remboursé et fermé.');

        return back();
    }

    /** @return array<string, mixed> */
    protected function serialize(Vault $vault): array
    {
        return [
            'id' => $vault->id,
            'reference' => $vault->reference,
            'label' => $vault->label,
            'customer' => $vault->customer?->displayName(),
            'article' => $vault->variant?->fullLabel(),
            'target' => $vault->target_amount,
            'saved' => $vault->saved_amount,
            'remaining' => $vault->remaining_amount,
            'progress' => $vault->progress,
            'status' => $vault->status->value,
            'statusLabel' => $vault->status->label(),
            'statusTone' => $vault->status->tone(),
            'createdAt' => $vault->created_at?->toIso8601String(),
        ];
    }
}
