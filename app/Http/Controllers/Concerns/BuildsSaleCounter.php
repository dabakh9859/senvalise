<?php

namespace App\Http\Controllers\Concerns;

use App\Enums\PaymentMethod;
use App\Models\Category;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Setting;

/**
 * Donnees de l'ecran de vente.
 *
 * La vente n'a plus d'ecran a elle : elle s'ouvre en fenetre depuis la liste
 * des factures et devis. Ces props voyagent donc avec cette liste, et le meme
 * assemblage sert au controleur de vente pour ses recherches.
 *
 * Le catalogue vendable part en entier au navigateur : la recherche et le scan
 * sont alors instantanes, sans aller-retour serveur. C'est ce qui compte
 * devant un client au comptoir.
 */
trait BuildsSaleCounter
{
    /** @return array<string, mixed> */
    protected function saleCounterProps(): array
    {
        return [
            'catalogue' => $this->saleCatalogue(),
            'categories' => Category::active()->orderBy('position')->get(['id', 'name']),
            /*
             * Client tout juste cree depuis la fenetre de vente. Il transite
             * par la session plutot que par le flash Inertia : le flash arrive
             * dans un evenement, pas dans les props, et c'est bien d'une prop
             * dont l'ecran a besoin pour se preselectionner.
             */
            'nouveauClientId' => session('nouveauClient'),
            'customers' => Customer::active()->orderBy('name')->limit(500)->get(['id', 'name', 'phone'])
                ->map(fn (Customer $c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'phone' => $c->phone,
                ]),
            'paymentMethods' => PaymentMethod::options(),
            'allowNegativeStock' => (bool) Setting::get('allow_negative_stock', false),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    protected function saleCatalogue(): array
    {
        return ProductVariant::query()
            ->with('product:id,name,category_id,is_active')
            ->active()
            ->whereHas('product', fn ($p) => $p->where('is_active', true))
            ->orderBy('product_id')
            ->orderBy('position')
            ->get()
            ->map(fn (ProductVariant $v) => $this->saleCatalogueRow($v))
            ->all();
    }

    /** @return array<string, mixed> */
    protected function saleCatalogueRow(ProductVariant $variant): array
    {
        return [
            'id' => $variant->id,
            'label' => $variant->fullLabel(),
            'productName' => $variant->product?->name,
            'variantLabel' => $variant->variant_label,
            'sku' => $variant->sku,
            'barcode' => $variant->barcode,
            'price' => $variant->selling_price,
            'stock' => $variant->stock_quantity,
            'categoryId' => $variant->product?->category_id,
        ];
    }
}
