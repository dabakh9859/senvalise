<?php

namespace App\Http\Controllers;

use App\Models\Customer;
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
