<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\Setting;
use App\Services\ImageSearchService;
use App\Services\ProductImageService;
use App\Services\ProductService;
use App\Support\Barcode;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    public function __construct(
        private readonly ProductService $products,
        private readonly ProductImageService $images,
        private readonly ImageSearchService $imageSearch,
    ) {}

    public function index(Request $request): Response
    {
        $isGerant = $request->user('web')->isGerant();

        $products = Product::query()
            ->with(['category:id,name', 'brand:id,name', 'variants', 'images'])
            ->search($request->string('recherche')->toString())
            ->when($request->filled('categorie'), fn ($q) => $q->where('category_id', $request->integer('categorie')))
            ->when($request->filled('marque'), fn ($q) => $q->where('brand_id', $request->integer('marque')))
            ->when($request->string('etat')->toString() === 'inactif', fn ($q) => $q->where('is_active', false))
            ->when($request->string('etat')->toString() === 'actif', fn ($q) => $q->where('is_active', true))
            ->when($request->string('etat')->toString() === 'publie', fn ($q) => $q->where('is_published', true))
            ->when(
                $request->string('stock')->toString() === 'bas',
                fn ($q) => $q->whereHas('variants', fn (Builder $v) => $v->whereColumn('stock_quantity', '<=', 'low_stock_threshold')),
            )
            ->when(
                $request->string('stock')->toString() === 'rupture',
                fn ($q) => $q->whereHas('variants', fn (Builder $v) => $v->where('stock_quantity', '<=', 0)),
            )
            ->orderBy('name')
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Product $product) => $this->toListRow($product, $isGerant));

        return Inertia::render('produits/index', [
            'products' => $products,
            'filters' => $request->only(['recherche', 'categorie', 'marque', 'etat', 'stock']),
            'categories' => Category::orderBy('position')->get(['id', 'name']),
            'brands' => Brand::orderBy('name')->get(['id', 'name']),
            'canManage' => $isGerant,
        ]);
    }

    /**
     * Une image distante peut avoir disparu : le produit est bien enregistré,
     * mais le gérant doit savoir laquelle n'a pas suivi.
     *
     * @param  array<int, string>  $failures
     */
    protected function reportImages(array $failures, string $success): void
    {
        if ($failures === []) {
            $this->toast($success);

            return;
        }

        $this->toast(
            $success.' '.count($failures).' image(s) non reprise(s) : '.$failures[0],
            'warning',
        );
    }

    /** @return array<int, array<string, mixed>> */
    protected function presentImages(Product $product): array
    {
        return $product->images
            ->map(fn (ProductImage $image) => [
                'id' => $image->id,
                'url' => $image->url,
                'alt' => $image->alt,
                'isPrimary' => $image->is_primary,
            ])
            ->all();
    }

    public function create(): Response
    {
        return Inertia::render('produits/form', [
            'product' => null,
            'images' => [],
            'reference' => Product::nextReference(),
            'categories' => Category::orderBy('position')->get(['id', 'name']),
            'brands' => Brand::orderBy('name')->get(['id', 'name']),
            'defaultThreshold' => (int) Setting::get('default_low_stock_threshold', 3),
            'imageSearchEnabled' => $this->imageSearch->isConfigured(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        $product = $this->products->create($data['product'], $data['variants']);

        $failures = $this->images->sync(
            product: $product,
            uploads: $request->file('images', []),
            urls: $request->input('image_urls', []),
        );

        ActivityLog::record('cree', "Produit « {$product->name} » créé", $product);
        $this->reportImages($failures, 'Produit enregistré.');

        return to_route('products.show', $product);
    }

    public function show(Request $request, Product $product): Response
    {
        $isGerant = $request->user('web')->isGerant();

        $product->load(['category:id,name', 'brand:id,name', 'variants', 'creator:id,name', 'images']);

        return Inertia::render('produits/show', [
            'images' => $this->presentImages($product),
            'product' => [
                'id' => $product->id,
                'reference' => $product->reference,
                'name' => $product->name,
                'description' => $product->description,
                'material' => $product->material,
                'warranty_months' => $product->warranty_months,
                'category' => $product->category?->name,
                'brand' => $product->brand?->name,
                'is_active' => $product->is_active,
                'is_published' => $product->is_published,
                'published_at' => $product->published_at?->toIso8601String(),
                'web_description' => $product->web_description,
                'created_by' => $product->creator?->name,
                'created_at' => $product->created_at?->toIso8601String(),
                'total_stock' => $product->totalStock(),
            ],
            'variants' => $product->variants->map(fn (ProductVariant $variant) => array_filter([
                'id' => $variant->id,
                'sku' => $variant->sku,
                'barcode' => $variant->barcode,
                'barcodeReadable' => $variant->barcode ? Barcode::humanReadable($variant->barcode) : null,
                'barcodeSvg' => $variant->barcode ? Barcode::svg($variant->barcode, 180, 46) : null,
                'size' => $variant->size,
                'color' => $variant->color,
                'dimensions' => $variant->dimensions,
                'weight_kg' => $variant->weight_kg,
                'capacity_l' => $variant->capacity_l,
                'selling_price' => $variant->selling_price,
                'web_price' => $variant->web_price,
                'stock_quantity' => $variant->stock_quantity,
                'low_stock_threshold' => $variant->low_stock_threshold,
                'is_active' => $variant->is_active,
                'cost_price' => $isGerant ? $variant->cost_price : null,
                'margin_amount' => $isGerant ? $variant->margin_amount : null,
                'margin_rate' => $isGerant ? $variant->margin_rate : null,
            ], fn ($value) => $value !== null))->all(),
            'canManage' => $isGerant,
        ]);
    }

    public function edit(Product $product): Response
    {
        $product->load(['variants', 'images']);

        return Inertia::render('produits/form', [
            'images' => $this->presentImages($product),
            'product' => [
                'id' => $product->id,
                'reference' => $product->reference,
                'name' => $product->name,
                'description' => $product->description,
                'category_id' => $product->category_id,
                'brand_id' => $product->brand_id,
                'material' => $product->material,
                'warranty_months' => $product->warranty_months,
                'is_active' => $product->is_active,
                'is_published' => $product->is_published,
                'web_description' => $product->web_description,
                'meta_title' => $product->meta_title,
                'meta_description' => $product->meta_description,
                'variants' => $product->variants->map(fn (ProductVariant $v) => [
                    'id' => $v->id,
                    'sku' => $v->sku,
                    'barcode' => $v->barcode,
                    'size' => $v->size,
                    'color' => $v->color,
                    'dimensions' => $v->dimensions,
                    'weight_kg' => $v->weight_kg,
                    'capacity_l' => $v->capacity_l,
                    'cost_price' => $v->cost_price,
                    'selling_price' => $v->selling_price,
                    'web_price' => $v->web_price,
                    'compare_at_price' => $v->compare_at_price,
                    'low_stock_threshold' => $v->low_stock_threshold,
                    'is_active' => $v->is_active,
                    'stock_quantity' => $v->stock_quantity,
                ])->all(),
            ],
            'reference' => $product->reference,
            'categories' => Category::orderBy('position')->get(['id', 'name']),
            'brands' => Brand::orderBy('name')->get(['id', 'name']),
            'defaultThreshold' => (int) Setting::get('default_low_stock_threshold', 3),
            'imageSearchEnabled' => $this->imageSearch->isConfigured(),
        ]);
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $data = $this->validated($request, $product);

        $this->products->update($product, $data['product'], $data['variants']);

        $failures = $this->images->sync(
            product: $product,
            uploads: $request->file('images', []),
            deletedIds: array_map('intval', $request->input('deleted_images', [])),
            primaryId: $request->filled('primary_image')
                ? $request->integer('primary_image')
                : null,
            urls: $request->input('image_urls', []),
        );

        ActivityLog::record('modifie', "Produit « {$product->name} » modifié", $product);
        $this->reportImages($failures, 'Produit mis à jour.');

        return to_route('products.show', $product);
    }

    public function destroy(Product $product): RedirectResponse
    {
        // Suppression douce : les ventes passées gardent leur libellé figé,
        // mais on ne perd pas la fiche si elle doit être restaurée.
        $name = $product->name;
        $product->delete();

        ActivityLog::record('supprime', "Produit « {$name} » supprimé", $product);
        $this->toast('Produit supprimé.');

        return to_route('products.index');
    }

    public function togglePublication(Product $product): RedirectResponse
    {
        $publish = ! $product->is_published;

        $product->update([
            'is_published' => $publish,
            'published_at' => $publish ? now() : null,
        ]);

        $this->toast($publish
            ? 'Produit publié sur la boutique en ligne.'
            : 'Produit retiré de la boutique en ligne.');

        return back();
    }

    /** @return array{product: array<string, mixed>, variants: array<int, array<string, mixed>>} */
    protected function validated(Request $request, ?Product $product = null): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'category_id' => ['nullable', 'exists:categories,id'],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'material' => ['nullable', 'string', 'max:255'],
            'warranty_months' => ['nullable', 'integer', 'min:0', 'max:600'],
            'is_active' => ['boolean'],
            'is_published' => ['boolean'],
            'web_description' => ['nullable', 'string'],
            'meta_title' => ['nullable', 'string', 'max:255'],
            'meta_description' => ['nullable', 'string', 'max:500'],

            'variants' => ['required', 'array', 'min:1'],
            'variants.*.id' => ['nullable', 'integer', Rule::exists('product_variants', 'id')->where('product_id', $product?->id)],
            'variants.*.size' => ['nullable', 'string', 'max:100'],
            'variants.*.color' => ['nullable', 'string', 'max:100'],
            'variants.*.dimensions' => ['nullable', 'string', 'max:100'],
            'variants.*.weight_kg' => ['nullable', 'numeric', 'min:0', 'max:999'],
            'variants.*.capacity_l' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'variants.*.cost_price' => ['nullable', 'integer', 'min:0'],
            'variants.*.selling_price' => ['required', 'integer', 'min:0'],
            'variants.*.web_price' => ['nullable', 'integer', 'min:0'],
            'variants.*.compare_at_price' => ['nullable', 'integer', 'min:0'],
            'variants.*.low_stock_threshold' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'variants.*.barcode' => ['nullable', 'string', 'max:64'],
            'variants.*.is_active' => ['boolean'],

            // Photos : jusqu'à 10 par envoi, 8 Mo chacune avant redimensionnement.
            'images' => ['nullable', 'array', 'max:10'],
            'images.*' => ['image', 'mimes:jpeg,jpg,png,webp', 'max:8192'],
            'deleted_images' => ['nullable', 'array'],
            'deleted_images.*' => ['integer'],
            'primary_image' => ['nullable', 'integer'],
            // Images reprises depuis la recherche en ligne.
            'image_urls' => ['nullable', 'array', 'max:10'],
            'image_urls.*' => ['url:http,https', 'max:2048'],
        ], [
            'variants.required' => 'Le produit doit avoir au moins une déclinaison.',
            'variants.*.selling_price.required' => 'Le prix de vente est obligatoire pour chaque déclinaison.',
        ]);

        $publish = (bool) ($validated['is_published'] ?? false);

        return [
            'product' => [
                'name' => $validated['name'],
                'description' => $validated['description'] ?? null,
                'category_id' => $validated['category_id'] ?? null,
                'brand_id' => $validated['brand_id'] ?? null,
                'material' => $validated['material'] ?? null,
                'warranty_months' => $validated['warranty_months'] ?? null,
                'is_active' => (bool) ($validated['is_active'] ?? true),
                'is_published' => $publish,
                'published_at' => $publish ? ($product->published_at ?? now()) : null,
                'web_description' => $validated['web_description'] ?? null,
                'meta_title' => $validated['meta_title'] ?? null,
                'meta_description' => $validated['meta_description'] ?? null,
            ],
            'variants' => $validated['variants'],
        ];
    }

    /** @return array<string, mixed> */
    protected function toListRow(Product $product, bool $isGerant): array
    {
        $variants = $product->variants;
        $stock = (int) $variants->sum('stock_quantity');
        $prices = $variants->pluck('selling_price')->filter()->all();

        return array_filter([
            'id' => $product->id,
            'reference' => $product->reference,
            'name' => $product->name,
            'image' => $product->images->first()?->url,
            'category' => $product->category?->name,
            'brand' => $product->brand?->name,
            'variantCount' => $variants->count(),
            'stock' => $stock,
            'isLowStock' => $variants->contains(fn (ProductVariant $v) => $v->is_active && $v->is_low_stock),
            'priceMin' => $prices ? min($prices) : 0,
            'priceMax' => $prices ? max($prices) : 0,
            'is_active' => $product->is_active,
            'is_published' => $product->is_published,
            'stockValue' => $isGerant
                ? (int) $variants->sum(fn (ProductVariant $v) => $v->stock_quantity * $v->cost_price)
                : null,
        ], fn ($value) => $value !== null);
    }
}
