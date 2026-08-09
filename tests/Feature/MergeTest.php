<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\User;
use App\Services\MergeService;
use App\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class MergeTest extends TestCase
{
    use RefreshDatabase;

    protected MergeService $merge;

    protected function setUp(): void
    {
        parent::setUp();

        $this->merge = app(MergeService::class);
    }

    protected function gerant(): User
    {
        return User::factory()->create(['role' => UserRole::Gerant->value]);
    }

    /*
    |--------------------------------------------------------------------------
    | Produits
    |--------------------------------------------------------------------------
    */

    /** Deux fois la même déclinaison : les quantités s'additionnent. */
    public function test_identical_variants_have_their_quantities_added(): void
    {
        $keep = Product::factory()->create(['name' => 'Valise cabine']);
        $duplicate = Product::factory()->create(['name' => 'valise cabine']);

        $kept = ProductVariant::factory()->withStock(4, 20000)->create([
            'product_id' => $keep->id,
            'size' => 'Cabine 55cm',
            'color' => 'Noir',
        ]);

        ProductVariant::factory()->withStock(6, 30000)->create([
            'product_id' => $duplicate->id,
            'size' => 'Cabine 55cm',
            'color' => 'Noir',
        ]);

        $this->merge->products($keep, [$duplicate->id]);

        $kept->refresh();

        $this->assertSame(10, $kept->stock_quantity);
        // Moyenne pondérée : (4×20 000 + 6×30 000) / 10 = 26 000
        $this->assertSame(26000, $kept->cost_price);
        $this->assertSoftDeleted('products', ['id' => $duplicate->id]);
    }

    /** Une déclinaison sans équivalent est simplement rattachée. */
    public function test_a_variant_without_a_twin_is_moved_over(): void
    {
        $keep = Product::factory()->create();
        $duplicate = Product::factory()->create();

        ProductVariant::factory()->withStock(3)->create([
            'product_id' => $keep->id,
            'size' => 'Cabine 55cm',
            'color' => 'Noir',
        ]);

        $orphan = ProductVariant::factory()->withStock(5)->create([
            'product_id' => $duplicate->id,
            'size' => 'Grande 75cm',
            'color' => 'Rouge',
        ]);

        $this->merge->products($keep, [$duplicate->id]);

        $this->assertSame($keep->id, $orphan->fresh()->product_id);
        $this->assertSame(5, $orphan->fresh()->stock_quantity);
        $this->assertCount(2, $keep->fresh()->variants);
    }

    /** Le total en stock avant et après la fusion doit être identique. */
    public function test_no_stock_is_created_or_lost(): void
    {
        $keep = Product::factory()->create();
        $duplicate = Product::factory()->create();

        ProductVariant::factory()->withStock(7)->create([
            'product_id' => $keep->id, 'size' => 'M', 'color' => 'Noir',
        ]);
        ProductVariant::factory()->withStock(9)->create([
            'product_id' => $duplicate->id, 'size' => 'M', 'color' => 'Noir',
        ]);

        $before = (int) ProductVariant::sum('stock_quantity');

        $this->merge->products($keep, [$duplicate->id]);

        $this->assertSame($before, (int) ProductVariant::sum('stock_quantity'));
    }

    /** L'historique des ventes doit survivre à la fusion. */
    public function test_past_sales_still_point_at_their_article(): void
    {
        $keep = Product::factory()->create();
        $duplicate = Product::factory()->create();

        ProductVariant::factory()->withStock(5)->create([
            'product_id' => $keep->id, 'size' => 'M', 'color' => 'Noir',
            'selling_price' => 30000,
        ]);

        $sold = ProductVariant::factory()->withStock(5)->create([
            'product_id' => $duplicate->id, 'size' => 'M', 'color' => 'Noir',
            'selling_price' => 30000,
        ]);

        $sale = app(SaleService::class)->create([
            ['product_variant_id' => $sold->id, 'quantity' => 2],
        ]);

        $this->merge->products($keep, [$duplicate->id]);

        $item = $sale->fresh('items')->items->first();

        $this->assertSame($sold->id, $item->product_variant_id);
        $this->assertSame(60000, $sale->fresh()->total);
    }

    /*
    |--------------------------------------------------------------------------
    | Clients
    |--------------------------------------------------------------------------
    */

    public function test_customer_sales_and_documents_move_to_the_kept_record(): void
    {
        $keep = Customer::create(['name' => 'Fatou Ndiaye', 'phone' => '77 123 45 67']);
        $duplicate = Customer::create([
            'name' => 'Fatou NDIAYE',
            'phone' => '77 123 45 67',
            'email' => 'fatou@exemple.test',
        ]);

        $variant = ProductVariant::factory()->withStock(10)->create();

        app(SaleService::class)->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1]],
            ['customer_id' => $duplicate->id],
        );

        Document::create([
            'type' => 'facture',
            'reference' => 'FA-TEST-0001',
            'customer_id' => $duplicate->id,
            'issue_date' => now()->toDateString(),
            'total' => 50000,
        ]);

        $result = $this->merge->customers($keep, [$duplicate->id]);

        $this->assertSame(1, $result['sales']);
        $this->assertSame(1, $result['documents']);
        $this->assertSame(1, Sale::where('customer_id', $keep->id)->count());
        $this->assertSame(1, Document::where('customer_id', $keep->id)->count());
        $this->assertDatabaseMissing('customers', ['id' => $duplicate->id]);
    }

    /** Les informations absentes de la fiche conservée sont récupérées. */
    public function test_missing_details_are_filled_from_the_duplicate(): void
    {
        $keep = Customer::create(['name' => 'Moussa Diop', 'phone' => '76 000 00 00']);
        $duplicate = Customer::create([
            'name' => 'Moussa Diop',
            'phone' => '76 000 00 00',
            'email' => 'moussa@exemple.test',
            'city' => 'Thiès',
        ]);

        $this->merge->customers($keep, [$duplicate->id]);

        $keep->refresh();

        $this->assertSame('moussa@exemple.test', $keep->email);
        $this->assertSame('Thiès', $keep->city);
    }

    /*
    |--------------------------------------------------------------------------
    | Catégories
    |--------------------------------------------------------------------------
    */

    /** Les quasi-doublons doivent d'abord pouvoir exister : slugs distincts. */
    public function test_two_categories_with_the_same_name_get_distinct_slugs(): void
    {
        $first = Category::create(['name' => 'Valises rigides']);
        $second = Category::create(['name' => 'Valises Rigides']);

        $this->assertSame('valises-rigides', $first->slug);
        $this->assertSame('valises-rigides-2', $second->slug);
    }

    public function test_category_products_are_transferred(): void
    {
        $keep = Category::create(['name' => 'Valises rigides']);
        $duplicate = Category::create(['name' => 'valises rigides ']);

        Product::factory()->count(3)->create(['category_id' => $duplicate->id]);

        $result = $this->merge->categories($keep, [$duplicate->id]);

        $this->assertSame(3, $result['products']);
        $this->assertSame(3, Product::where('category_id', $keep->id)->count());
        $this->assertDatabaseMissing('categories', ['id' => $duplicate->id]);
    }

    /*
    |--------------------------------------------------------------------------
    | Garde-fous
    |--------------------------------------------------------------------------
    */

    public function test_a_record_cannot_be_merged_into_itself(): void
    {
        $category = Category::create(['name' => 'Accessoires']);

        $this->expectException(RuntimeException::class);

        $this->merge->categories($category, [$category->id]);
    }

    public function test_an_unknown_record_is_refused(): void
    {
        $category = Category::create(['name' => 'Accessoires']);

        $this->expectException(RuntimeException::class);

        $this->merge->categories($category, [99999]);
    }

    /*
    |--------------------------------------------------------------------------
    | Écran
    |--------------------------------------------------------------------------
    */

    public function test_the_screen_lists_detected_groups(): void
    {
        Category::create(['name' => 'Valises rigides']);
        Category::create(['name' => 'Valises Rigides']);

        $this->actingAs($this->gerant())
            ->get('/doublons?type=categories')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('kind', 'categories')
                ->has('groups', 1)
                ->has('groups.0.items', 2));
    }

    public function test_a_seller_cannot_reach_the_duplicates_screen(): void
    {
        $this->actingAs(User::factory()->create(['role' => UserRole::Vendeur->value]))
            ->get('/doublons')
            ->assertForbidden();
    }
}
