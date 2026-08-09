<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use Illuminate\Support\Str;

/**
 * Repère les fiches saisies deux fois.
 *
 * Le rapprochement se fait sur une forme « normalisée » : sans accents, sans
 * ponctuation, sans majuscules ni espaces multiples. « Valise Cabine 55 » et
 * « valise cabine 55 » se retrouvent ainsi côte à côte.
 */
class DuplicateFinder
{
    /** @return array<int, array<string, mixed>> */
    public function products(): array
    {
        return Product::query()
            ->with(['category:id,name', 'brand:id,name', 'variants'])
            ->orderBy('name')
            ->get()
            ->groupBy(fn (Product $product) => $this->normalize($product->name))
            ->filter(fn ($group) => $group->count() > 1)
            ->map(fn ($group) => [
                'key' => $this->normalize($group->first()->name),
                'label' => $group->first()->name,
                'items' => $group->map(fn (Product $product) => [
                    'id' => $product->id,
                    'name' => $product->name,
                    'reference' => $product->reference,
                    'detail' => trim(implode(' · ', array_filter([
                        $product->category?->name,
                        $product->brand?->name,
                    ]))),
                    'counts' => [
                        ['label' => 'déclinaisons', 'value' => $product->variants->count()],
                        ['label' => 'en stock', 'value' => (int) $product->variants->sum('stock_quantity')],
                    ],
                    'createdAt' => $product->created_at?->toIso8601String(),
                ])->values()->all(),
            ])
            ->values()
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    public function customers(): array
    {
        return Customer::query()
            ->withCount(['sales', 'documents'])
            ->orderBy('name')
            ->get()
            // Le téléphone identifie mieux un client que son nom : deux
            // « Moussa Diop » peuvent être deux personnes différentes.
            ->groupBy(fn (Customer $customer) => filled($customer->phone)
                ? 'tel:'.preg_replace('/\D/', '', (string) $customer->phone)
                : 'nom:'.$this->normalize($customer->name))
            ->filter(fn ($group) => $group->count() > 1)
            ->map(fn ($group) => [
                'key' => (string) $group->first()->id,
                'label' => $group->first()->displayName(),
                'items' => $group->map(fn (Customer $customer) => [
                    'id' => $customer->id,
                    'name' => $customer->displayName(),
                    'reference' => $customer->phone ?? '—',
                    'detail' => trim(implode(' · ', array_filter([
                        $customer->email,
                        $customer->city,
                    ]))),
                    'counts' => [
                        ['label' => 'ventes', 'value' => (int) $customer->sales_count],
                        ['label' => 'documents', 'value' => (int) $customer->documents_count],
                    ],
                    'createdAt' => $customer->created_at?->toIso8601String(),
                ])->values()->all(),
            ])
            ->values()
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    public function categories(): array
    {
        return Category::query()
            ->withCount('products')
            ->orderBy('name')
            ->get()
            ->groupBy(fn (Category $category) => $this->normalize($category->name))
            ->filter(fn ($group) => $group->count() > 1)
            ->map(fn ($group) => [
                'key' => $this->normalize($group->first()->name),
                'label' => $group->first()->name,
                'items' => $group->map(fn (Category $category) => [
                    'id' => $category->id,
                    'name' => $category->name,
                    'reference' => $category->slug,
                    'detail' => (string) $category->description,
                    'counts' => [
                        ['label' => 'produits', 'value' => (int) $category->products_count],
                    ],
                    'createdAt' => $category->created_at?->toIso8601String(),
                ])->values()->all(),
            ])
            ->values()
            ->all();
    }

    protected function normalize(string $value): string
    {
        $ascii = Str::lower(Str::ascii($value));
        $clean = preg_replace('/[^a-z0-9]+/', ' ', $ascii) ?? '';

        return trim(preg_replace('/\s+/', ' ', $clean) ?? '');
    }
}
