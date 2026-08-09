<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        $suppliers = Supplier::query()
            ->withCount('arrivals')
            ->withSum(['arrivals as invested' => fn ($q) => $q->where('status', 'receptionne')], 'total_cost')
            ->when($request->filled('recherche'), function ($q) use ($request) {
                $term = $request->string('recherche')->toString();
                $q->where('name', 'like', "%{$term}%")
                    ->orWhere('contact_name', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%");
            })
            ->orderBy('name')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (Supplier $supplier) => [
                'id' => $supplier->id,
                'name' => $supplier->name,
                'contactName' => $supplier->contact_name,
                'phone' => $supplier->phone,
                'email' => $supplier->email,
                'address' => $supplier->address,
                'city' => $supplier->city,
                'country' => $supplier->country,
                'notes' => $supplier->notes,
                'isActive' => $supplier->is_active,
                'arrivalsCount' => (int) $supplier->arrivals_count,
                'invested' => (int) ($supplier->invested ?? 0),
            ]);

        return Inertia::render('reglages/fournisseurs', [
            'suppliers' => $suppliers,
            'filters' => $request->only(['recherche']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        Supplier::create($this->validated($request));

        $this->toast('Fournisseur enregistré.');

        return back();
    }

    public function update(Request $request, Supplier $supplier): RedirectResponse
    {
        $supplier->update($this->validated($request));

        $this->toast('Fournisseur mis à jour.');

        return back();
    }

    public function destroy(Supplier $supplier): RedirectResponse
    {
        if ($supplier->arrivals()->exists()) {
            $supplier->update(['is_active' => false]);
            $this->toast('Fournisseur désactivé (des arrivages lui sont rattachés).');

            return back();
        }

        $supplier->delete();
        $this->toast('Fournisseur supprimé.');

        return back();
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'country' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['boolean'],
        ]);
    }
}
