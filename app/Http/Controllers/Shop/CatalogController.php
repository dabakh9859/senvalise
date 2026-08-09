<?php

namespace App\Http\Controllers\Shop;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Customer;
use App\Models\HomeBlock;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\SaleItem;
use App\Models\Vault;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * La vitrine : accueil, catalogue, fiche produit.
 *
 * Seuls les produits explicitement publiés sortent d'ici. Un produit du
 * catalogue interne n'apparaît jamais en ligne par accident — la publication
 * est une décision, pas un effet de bord.
 */
class CatalogController extends Controller
{
    public function home(): Response
    {
        $blocks = HomeBlock::visible()
            ->with(['product.images', 'product.variants', 'product.category:id,name,slug'])
            ->get();

        return Inertia::render('boutique/accueil', [
            'hero' => $this->blocksOfType($blocks, 'banniere'),
            'videos' => $this->blocksOfType($blocks, 'video'),
            'promos' => $this->blocksOfType($blocks, 'promo'),
            'arguments' => $this->blocksOfType($blocks, 'argument'),
            'nouveautes' => $this->cards(
                $this->published()->latest('published_at')->limit(8)->get(),
            ),
            'bestsellers' => $this->cards($this->bestsellers()),
            'bonnesAffaires' => $this->cards($this->discounted()),
            'categories' => $this->categoryCards(),
            'vedettes' => $this->vedettes($blocks),
        ]);
    }

    /**
     * Le coffre, expliqué.
     *
     * Page publique, et c'est le point : « Le coffre » est un lien du menu
     * principal, donc une promesse commerciale. Un visiteur qui clique dessus
     * doit comprendre de quoi il s'agit avant qu'on lui demande un compte —
     * l'envoyer directement sur une page protégée revient à lui claquer la
     * porte au nez.
     */
    public function vault(): Response
    {
        $customer = Auth::guard('client')->user();

        return Inertia::render('boutique/coffre', [
            // Ce qu'on peut viser : une poignée d'articles, du plus cher au
            // moins cher, pour donner une idée concrète de l'objectif.
            'suggestions' => $this->cards(
                $this->published()->limit(4)->get(),
            ),
            'mesCoffres' => $customer instanceof Customer
                ? $customer->vaults()->active()->get()->map(fn (Vault $vault) => [
                    'id' => $vault->id,
                    'label' => $vault->label,
                    'target' => $vault->target_amount,
                    'saved' => $vault->saved_amount,
                    'progress' => $vault->progress,
                    'statusLabel' => $vault->status->label(),
                ])->all()
                : null,
        ]);
    }

    public function index(Request $request): Response
    {
        $products = $this->published()
            ->when($request->filled('categorie'), fn ($q) => $q->whereHas(
                'category',
                fn ($c) => $c->where('slug', $request->string('categorie')->toString()),
            ))
            ->when($request->filled('recherche'), function ($q) use ($request) {
                $term = $request->string('recherche')->toString();

                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%"));
            })
            ->when($request->string('tri')->toString() === 'nouveautes',
                fn ($q) => $q->latest('published_at'),
                fn ($q) => $q->orderBy('name'),
            )
            ->paginate(12)
            ->withQueryString()
            ->through(fn (Product $product) => $this->card($product));

        return Inertia::render('boutique/catalogue', [
            'products' => $products,
            'filters' => $request->only(['categorie', 'recherche', 'tri']),
            'categories' => Category::query()
                ->where('is_active', true)
                ->orderBy('position')
                ->get(['name', 'slug'])
                ->all(),
        ]);
    }

    public function show(string $slug): Response
    {
        $product = $this->published()
            ->where('slug', $slug)
            ->firstOrFail();

        $variants = $product->variants()
            ->where('is_active', true)
            ->orderBy('position')
            ->get()
            ->map(fn (ProductVariant $variant) => [
                'id' => $variant->id,
                'label' => $variant->variant_label,
                'size' => $variant->size,
                'color' => $variant->color,
                'sku' => $variant->sku,
                'price' => $this->webPrice($variant),
                'compareAt' => $variant->compare_at_price,
                // Disponible = en stock moins ce que d'autres ont déjà réservé.
                'available' => $variant->available_quantity,
                'dimensions' => $variant->dimensions,
                'capacity' => $variant->capacity_l,
                'weight' => $variant->weight_kg,
            ])
            ->values()
            ->all();

        return Inertia::render('boutique/produit', [
            'product' => [
                'id' => $product->id,
                'name' => $product->name,
                'slug' => $product->slug,
                'description' => $product->web_description ?: $product->description,
                'category' => $product->category?->name,
                'brand' => $product->brand?->name,
                'material' => $product->material,
                'warrantyMonths' => $product->warranty_months,
                'images' => $product->images
                    ->sortByDesc('is_primary')
                    ->map(fn ($image) => ['url' => $image->url, 'alt' => $image->alt])
                    ->values()
                    ->all(),
            ],
            'variants' => $variants,
            'similaires' => $this->cards(
                $this->published()
                    ->where('id', '!=', $product->id)
                    ->when($product->category_id, fn ($q) => $q->where('category_id', $product->category_id))
                    ->limit(4)
                    ->get(),
            ),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Assistants
    |--------------------------------------------------------------------------
    */

    /** @return Builder<Product> */
    protected function published(): Builder
    {
        return Product::query()
            ->with(['images', 'variants', 'category:id,name,slug', 'brand:id,name'])
            ->where('is_active', true)
            ->where('is_published', true)
            // Un produit sans déclinaison vendable n'a rien à faire en vitrine.
            ->whereHas('variants', fn ($q) => $q->where('is_active', true));
    }

    /**
     * Les vraies meilleures ventes, d'après ce qui est réellement sorti du
     * rayon — pas une sélection choisie à la main.
     *
     * Tant que la boutique n'a rien vendu, on retombe sur les nouveautés :
     * une rangée vide sur la page d'accueil ferait plus de mal qu'un
     * classement approximatif.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, Product>
     */
    protected function bestsellers(int $limit = 8): \Illuminate\Database\Eloquent\Collection
    {
        $ranked = SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('product_variants', 'product_variants.id', '=', 'sale_items.product_variant_id')
            ->where('sales.status', 'validee')
            ->groupBy('product_variants.product_id')
            ->selectRaw('product_variants.product_id as product_id, sum(sale_items.quantity) as sold')
            ->orderByDesc('sold')
            ->limit($limit)
            ->toBase()
            ->pluck('product_id')
            ->all();

        if ($ranked === []) {
            return $this->published()->latest('published_at')->limit($limit)->get();
        }

        // Le classement se fait en PHP : « whereIn » ne garantit pas l'ordre,
        // et le reproduire en SQL demanderait de fabriquer une requête à la
        // main pour huit lignes.
        $rank = array_flip($ranked);

        return $this->published()
            ->whereIn('products.id', $ranked)
            ->get()
            ->sortBy(fn (Product $product): int => $rank[$product->id] ?? PHP_INT_MAX)
            ->values();
    }

    /**
     * Les produits mis en vitrine dans le héros.
     *
     * Chacun arrive avec ses vraies caractéristiques — dimensions, capacité,
     * poids, matière, garantie — affichées en pastilles autour de la photo.
     * Ce sont les chiffres de la fiche, pas des arguments écrits à la main :
     * une valise annoncée « 40 L » l'est parce que la déclinaison le dit.
     *
     * Le gérant choisit en rattachant un produit à une bannière ; sinon on
     * prend les meilleures ventes, pour que la vitrine ne soit jamais vide.
     *
     * @param  \Illuminate\Database\Eloquent\Collection<int, HomeBlock>  $blocks
     * @return array<int, array<string, mixed>>
     */
    protected function vedettes($blocks): array
    {
        $choisis = $blocks
            ->whereIn('type', ['banniere', 'promo'])
            ->map(fn (HomeBlock $block) => $block->product)
            ->filter()
            ->unique('id');

        $produits = $choisis->count() >= 3
            ? $choisis->take(4)
            : $choisis->concat($this->bestsellers(4))->unique('id')->take(4);

        return $produits
            ->map(function (Product $product): array {
                $variant = $product->variants
                    ->where('is_active', true)
                    ->sortBy('position')
                    ->first();

                return [
                    ...$this->card($product),
                    'tagline' => $product->web_description
                        ? Str::limit(strip_tags((string) $product->web_description), 70)
                        : ($product->category->name ?? 'Bagage du moment'),
                    'specs' => $this->specs($product, $variant),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Les caractéristiques marquantes d'un article, en clair.
     *
     * Quatre au maximum : elles sont posées aux quatre coins de la photo, et
     * au-delà elles se marcheraient dessus.
     *
     * @return array<int, string>
     */
    protected function specs(Product $product, ?ProductVariant $variant): array
    {
        $specs = array_filter([
            $variant?->dimensions,
            $variant?->capacity_l ? "{$variant->capacity_l} L" : null,
            $variant?->weight_kg
                ? str_replace('.', ',', rtrim(rtrim((string) $variant->weight_kg, '0'), '.')).' kg'
                : null,
            $product->material,
            $product->warranty_months ? "Garantie {$product->warranty_months} mois" : null,
        ]);

        return array_slice(array_values(array_map('strval', $specs)), 0, 4);
    }

    /**
     * Vignettes de catégorie.
     *
     * L'image est reprise du premier produit publié de la catégorie : le
     * gérant n'a pas une photo de plus à fournir, et la vignette suit
     * naturellement le catalogue.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function categoryCards(): array
    {
        return Category::query()
            ->where('is_active', true)
            ->withCount(['products' => fn ($q) => $q->where('is_published', true)->where('is_active', true)])
            ->orderBy('position')
            ->get()
            ->map(function (Category $category): array {
                $product = $this->published()
                    ->where('category_id', $category->id)
                    ->first();

                $image = $product?->images->firstWhere('is_primary', true)
                    ?? $product?->images->first();

                return [
                    'name' => $category->name,
                    'slug' => $category->slug,
                    'description' => $category->description,
                    'count' => (int) $category->products_count,
                    'image' => $image?->url,
                ];
            })
            ->all();
    }

    /**
     * Les articles en promotion : ceux dont le prix web est inférieur au prix
     * barré affiché.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, Product>
     */
    protected function discounted(): \Illuminate\Database\Eloquent\Collection
    {
        return $this->published()
            ->whereHas('variants', fn ($q) => $q
                ->where('is_active', true)
                ->whereNotNull('compare_at_price')
                ->whereColumn('compare_at_price', '>', 'selling_price'))
            ->limit(8)
            ->get();
    }

    /**
     * @param  Collection<int, HomeBlock>|\Illuminate\Database\Eloquent\Collection<int, HomeBlock>  $blocks
     * @return array<int, array<string, mixed>>
     */
    protected function blocksOfType($blocks, string $type): array
    {
        return $blocks
            ->where('type', $type)
            ->map(fn (HomeBlock $block) => [
                'id' => $block->id,
                'title' => $block->title,
                'subtitle' => $block->subtitle,
                'body' => $block->body,
                'image' => $block->imageUrl(),
                'video' => $block->video_url,
                'linkUrl' => $block->link_url,
                'linkLabel' => $block->link_label,
                'product' => $block->product
                    ? $this->card($block->product)
                    : null,
            ])
            ->values()
            ->all();
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Collection<int, Product>  $products
     * @return array<int, array<string, mixed>>
     */
    protected function cards($products): array
    {
        return $products->map(fn (Product $product) => $this->card($product))->values()->all();
    }

    /** @return array<string, mixed> */
    protected function card(Product $product): array
    {
        $variants = $product->relationLoaded('variants')
            ? $product->variants->where('is_active', true)
            : $product->variants()->where('is_active', true)->get();

        $prices = $variants->map(fn (ProductVariant $variant) => $this->webPrice($variant));
        $compare = $variants->max('compare_at_price');
        $price = (int) ($prices->min() ?? 0);

        $primary = $product->images->firstWhere('is_primary', true) ?? $product->images->first();

        return [
            'id' => $product->id,
            'name' => $product->name,
            'slug' => $product->slug,
            'category' => $product->category?->name,
            'brand' => $product->brand?->name,
            'image' => $primary?->url,
            'price' => $price,
            'priceMax' => (int) ($prices->max() ?? 0),
            // Prix barré uniquement s'il est réellement supérieur : afficher
            // une fausse réduction ferait perdre la confiance une seule fois.
            'compareAt' => $compare > $price ? (int) $compare : null,
            'available' => (int) $variants->sum(fn (ProductVariant $v) => $v->available_quantity),
        ];
    }

    protected function webPrice(ProductVariant $variant): int
    {
        return $variant->web_price > 0 ? $variant->web_price : $variant->selling_price;
    }
}
