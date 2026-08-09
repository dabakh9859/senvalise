<?php

namespace App\Http\Controllers;

use App\Models\Brand;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class BrandController extends Controller
{
    public function index(): Response
    {
        $brands = Brand::withCount('products')
            ->orderBy('name')
            ->get()
            ->map(fn (Brand $brand) => [
                'id' => $brand->id,
                'name' => $brand->name,
                'slug' => $brand->slug,
                'isActive' => $brand->is_active,
                'productsCount' => (int) $brand->products_count,
            ]);

        return Inertia::render('reglages/marques', [
            'brands' => $brands,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        Brand::create($this->validated($request));

        $this->toast('Marque créée.');

        return back();
    }

    public function update(Request $request, Brand $brand): RedirectResponse
    {
        $brand->update($this->validated($request, $brand));

        $this->toast('Marque mise à jour.');

        return back();
    }

    public function destroy(Brand $brand): RedirectResponse
    {
        if ($brand->products()->exists()) {
            $this->toast('Impossible de supprimer : des produits utilisent cette marque.', 'error');

            return back();
        }

        $brand->delete();
        $this->toast('Marque supprimée.');

        return back();
    }

    /** @return array<string, mixed> */
    protected function validated(Request $request, ?Brand $brand = null): array
    {
        return $request->validate([
            'name' => [
                'required', 'string', 'max:255',
                Rule::unique('brands', 'name')->ignore($brand?->id),
            ],
            'is_active' => ['boolean'],
        ]);
    }
}
