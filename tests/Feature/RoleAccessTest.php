<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RoleAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function gerant(): User
    {
        return User::factory()->create(['role' => UserRole::Gerant->value]);
    }

    protected function vendeur(): User
    {
        return User::factory()->create(['role' => UserRole::Vendeur->value]);
    }

    /** @return array<int, string> Écrans réservés au gérant. */
    public static function restrictedRoutes(): array
    {
        return [
            ['/arrivages'],
            ['/rapports'],
            ['/commandes'],
            ['/coffres'],
            ['/stock/inventaire'],
            ['/reglages/boutique'],
            ['/reglages/categories'],
            ['/reglages/marques'],
            ['/reglages/fournisseurs'],
            ['/reglages/utilisateurs'],
        ];
    }

    #[DataProvider('restrictedRoutes')]
    public function test_a_seller_is_blocked_from_management_screens(string $url): void
    {
        $this->actingAs($this->vendeur())->get($url)->assertForbidden();
    }

    #[DataProvider('restrictedRoutes')]
    public function test_the_manager_reaches_every_management_screen(string $url): void
    {
        $this->actingAs($this->gerant())->get($url)->assertOk();
    }

    /** @return array<int, string> Écrans du quotidien, ouverts aux deux rôles. */
    public static function sharedRoutes(): array
    {
        return [
            ['/dashboard'],
            ['/caisse'],
            ['/achats'],
            ['/ventes'],
            ['/retours'],
            ['/retours/nouveau'],
            ['/produits'],
            ['/stock/mouvements'],
            ['/clients'],
            ['/documents'],
            ['/etiquettes'],
        ];
    }

    #[DataProvider('sharedRoutes')]
    public function test_a_seller_reaches_the_day_to_day_screens(string $url): void
    {
        $this->actingAs($this->vendeur())->get($url)->assertOk();
    }

    /** Le stock a rejoint le catalogue : son ancienne adresse y mene. */
    public function test_the_old_stock_url_lands_on_the_catalogue(): void
    {
        $this->actingAs($this->vendeur())
            ->get('/stock')
            ->assertRedirect('/produits');
    }

    /** L'ancienne adresse de la caisse mene a la liste, comptoir deja ouvert. */
    public function test_the_old_sale_url_lands_on_the_documents_list(): void
    {
        $this->actingAs($this->vendeur())
            ->get('/vente')
            ->assertRedirect('/documents?vente=1');

        $this->actingAs($this->vendeur())
            ->get('/documents?vente=1')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('documents/index')
                ->where('openCounter', true));
    }

    /**
     * Le catalogue porte les quantites : le resume, les colonnes de stock et
     * les motifs d'ajustement voyagent avec la liste des produits.
     */
    public function test_the_catalogue_carries_the_stock(): void
    {
        $variant = ProductVariant::factory()->withStock(2)->create();
        $variant->update(['low_stock_threshold' => 5]);

        $this->actingAs($this->gerant())
            ->get('/produits')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('produits/index')
                ->where('summary.references', 1)
                ->where('summary.articles', 2)
                ->where('summary.lowStock', 1)
                ->where('summary.outOfStock', 0)
                ->where('products.data.0.stock', 2)
                ->where('products.data.0.available', 2)
                ->where('products.data.0.lowCount', 1)
                ->has('products.data.0.variants', 1)
                ->has('reasons'));
    }

    /** La valeur du stock se lit sur le prix de revient : pas pour le vendeur. */
    public function test_the_seller_sees_no_stock_value_in_the_catalogue(): void
    {
        ProductVariant::factory()->withStock(2, 9000)->create();

        $this->actingAs($this->vendeur())
            ->get('/produits')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->missing('summary.stockValue')
                ->missing('products.data.0.stockValue'));
    }

    public function test_a_seller_never_sees_purchase_prices_or_margins(): void
    {
        $variant = ProductVariant::factory()->withStock(5, 12345)->create();

        $this->actingAs($this->vendeur())
            ->get("/produits/{$variant->product_id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canManage', false)
                ->missing('variants.0.cost_price')
                ->missing('variants.0.margin_amount'));
    }

    public function test_the_manager_sees_purchase_prices(): void
    {
        $variant = ProductVariant::factory()->withStock(5, 12345)->create();

        $this->actingAs($this->gerant())
            ->get("/produits/{$variant->product_id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canManage', true)
                ->where('variants.0.cost_price', 12345));
    }

    public function test_the_settings_root_lands_on_the_shop_page(): void
    {
        $this->actingAs($this->gerant())
            ->get('/reglages')
            ->assertRedirect('/reglages/boutique');
    }

    public function test_a_seller_cannot_cancel_a_sale(): void
    {
        $variant = ProductVariant::factory()->withStock(5)->create();

        $sale = app(SaleService::class)->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);

        $this->actingAs($this->vendeur())
            ->post("/ventes/{$sale->id}/annuler")
            ->assertForbidden();

        $this->assertSame(4, $variant->fresh()->stock_quantity);
    }

    public function test_a_seller_cannot_create_a_product(): void
    {
        $this->actingAs($this->vendeur())
            ->post('/produits', [
                'name' => 'Valise pirate',
                'variants' => [['selling_price' => 1000]],
            ])
            ->assertForbidden();

        $this->assertDatabaseCount('products', 0);
    }
}
