<?php

namespace App\Http\Controllers;

use App\Enums\DocumentStatus;
use App\Enums\SaleStatus;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Order;
use App\Models\Sale;
use App\Models\SaleReturn;
use App\Models\Vault;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CustomerController extends Controller
{
    public function index(Request $request): Response
    {
        $customers = Customer::query()
            ->withCount('sales')
            ->withSum(['sales as revenue' => fn ($q) => $q->where('status', 'validee')], 'total')
            ->search($request->string('recherche')->toString())
            ->when($request->string('type')->toString() !== '', fn ($q) => $q->where('type', $request->string('type')->toString()))
            ->orderBy('name')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (Customer $customer) => [
                'id' => $customer->id,
                'type' => $customer->type,
                'name' => $customer->name,
                'displayName' => $customer->displayName(),
                'companyName' => $customer->company_name,
                'phone' => $customer->phone,
                'email' => $customer->email,
                'city' => $customer->city,
                'address' => $customer->address,
                'ninea' => $customer->ninea,
                'notes' => $customer->notes,
                'isActive' => $customer->is_active,
                'whatsappOptIn' => $customer->acceptsWhatsapp(),
                'salesCount' => (int) $customer->sales_count,
                'revenue' => (int) ($customer->revenue ?? 0),
            ]);

        return Inertia::render('clients/index', [
            'customers' => $customers,
            'filters' => $request->only(['recherche', 'type']),
        ]);
    }

    /**
     * Fiche recapitulative : tout ce que la boutique sait de ce client sur un
     * seul ecran.
     *
     * L'ordre suit la question qu'on se pose au comptoir quand quelqu'un se
     * presente : qui est-ce, combien il pese, est-ce qu'il nous doit quelque
     * chose, et qu'a-t-il achete la derniere fois.
     */
    public function show(Request $request, Customer $customer): Response
    {
        $isGerant = $request->user('web')->isGerant();

        $sales = $customer->sales()
            ->with('items:id,sale_id,designation,quantity,line_total')
            ->latest('sold_at')
            ->limit(50)
            ->get();

        $valid = $sales->where('status', SaleStatus::Validee);
        $revenue = (int) $valid->sum('total');
        $outstanding = (int) $valid->sum(fn (Sale $sale) => max(0, $sale->total - $sale->amount_paid));

        $documents = $customer->documents()->latest('issue_date')->limit(30)->get();
        $unpaidDocuments = (int) $documents
            ->where('status', '!=', DocumentStatus::Annule)
            ->sum(fn (Document $document) => max(0, $document->total - $document->amount_paid));

        $returns = $customer->returns()->with('items')->limit(20)->get();

        return Inertia::render('clients/show', [
            'customer' => [
                'id' => $customer->id,
                'type' => $customer->type,
                'name' => $customer->name,
                'displayName' => $customer->displayName(),
                'companyName' => $customer->company_name,
                'phone' => $customer->phone,
                'email' => $customer->email,
                'address' => $customer->address,
                'city' => $customer->city,
                'ninea' => $customer->ninea,
                'notes' => $customer->notes,
                'isActive' => $customer->is_active,
                'whatsappOptIn' => $customer->acceptsWhatsapp(),
                'hasWebAccount' => $customer->hasWebAccount(),
                'since' => $customer->created_at?->toIso8601String(),
            ],
            'summary' => [
                'revenue' => $revenue,
                'salesCount' => $valid->count(),
                'averageBasket' => $valid->count() > 0 ? (int) round($revenue / $valid->count()) : 0,
                'outstanding' => $outstanding + $unpaidDocuments,
                'lastPurchase' => $valid->first()?->sold_at?->toIso8601String(),
                'returnsCount' => $returns->count(),
                'returnsAmount' => (int) $returns->sum('total_refund'),
                'openCredit' => (int) $returns->filter(fn (SaleReturn $r) => $r->isOpenCredit())->sum('total_refund'),
                'margin' => $isGerant ? $revenue - (int) $valid->sum('total_cost') : null,
            ],
            'sales' => $sales->map(fn (Sale $sale) => [
                'id' => $sale->id,
                'reference' => $sale->reference,
                'soldAt' => $sale->sold_at?->toIso8601String(),
                'total' => $sale->total,
                'amountPaid' => $sale->amount_paid,
                'balance' => max(0, $sale->total - $sale->amount_paid),
                'status' => $sale->status->value,
                'paymentLabel' => $sale->payment_method->label(),
                'itemCount' => (int) $sale->items->sum('quantity'),
                'summary' => $sale->items->take(3)->pluck('designation')->implode(', '),
            ])->all(),
            'documents' => $documents->map(fn (Document $document) => [
                'id' => $document->id,
                'reference' => $document->reference,
                'type' => $document->type->value,
                'typeLabel' => $document->type->label(),
                'status' => $document->status->value,
                'statusLabel' => $document->status->label(),
                'issueDate' => $document->issue_date?->toDateString(),
                'total' => $document->total,
                'balance' => max(0, $document->total - $document->amount_paid),
            ])->all(),
            'returns' => $returns->map(fn (SaleReturn $return) => [
                'id' => $return->id,
                'reference' => $return->reference,
                'returnedAt' => $return->returned_at->toIso8601String(),
                'reasonLabel' => $return->reason->label(),
                'refundLabel' => $return->refund_method->label(),
                'totalRefund' => $return->total_refund,
                'isOpenCredit' => $return->isOpenCredit(),
            ])->all(),
            'orders' => $customer->orders()->limit(20)->get()->map(fn (Order $order) => [
                'id' => $order->id,
                'reference' => $order->reference,
                'placedAt' => $order->placed_at?->toIso8601String(),
                'status' => $order->status->value,
                'total' => $order->total,
            ])->all(),
            'vaults' => $customer->vaults()->get()->map(fn (Vault $vault) => [
                'id' => $vault->id,
                'reference' => $vault->reference,
                'target' => $vault->target_amount,
                'saved' => $vault->saved_amount,
                'status' => $vault->status->value,
            ])->all(),
            'canManage' => $isGerant,
            // Commandes et coffres sont des ecrans gerant : inutile de proposer
            // au vendeur des liens qui le renverraient sur un 403.
            'canOpenShop' => $isGerant,
        ]);
    }

    // La création et la modification se font dans une fenêtre depuis la liste :
    // pas d'écran dédié.
    public function store(Request $request): RedirectResponse
    {
        Customer::create($this->validated($request));

        $this->toast('Client enregistré.');

        return back();
    }

    public function update(Request $request, Customer $customer): RedirectResponse
    {
        $customer->update($this->validated($request, $customer));

        $this->toast('Client mis à jour.');

        return back();
    }

    public function destroy(Customer $customer): RedirectResponse
    {
        // Un client rattaché à des ventes ou des documents est désactivé
        // plutôt que supprimé, pour ne pas casser l'historique.
        if ($customer->sales()->exists() || $customer->documents()->exists()) {
            $customer->update(['is_active' => false]);
            $this->toast('Client désactivé (il a un historique de ventes).');

            return back();
        }

        $customer->delete();
        $this->toast('Client supprimé.');

        return back();
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?Customer $current = null): array
    {
        $validated = $request->validate([
            'type' => ['required', 'in:particulier,entreprise'],
            'name' => ['required', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'ninea' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
            'whatsapp_opt_in' => ['boolean'],
        ]);

        // Le consentement est une date, pas une case : savoir *quand* le
        // client a accepte est ce qui permet de le prouver si Meta le demande.
        $optIn = (bool) ($validated['whatsapp_opt_in'] ?? false);
        unset($validated['whatsapp_opt_in']);

        $validated['whatsapp_opt_in_at'] = $optIn
            ? ($current?->acceptsWhatsapp() ? $current->whatsapp_opt_in_at : now())
            : $current?->whatsapp_opt_in_at;

        // Decocher la case vaut retrait du consentement.
        if (! $optIn && $current?->acceptsWhatsapp()) {
            $validated['whatsapp_opt_out_at'] = now();
        }

        return $validated;
    }
}
