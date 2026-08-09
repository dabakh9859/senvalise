<?php

namespace Tests\Feature;

use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Enums\UserRole;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\User;
use App\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class SaleTest extends TestCase
{
    use RefreshDatabase;

    protected SaleService $sales;

    protected function setUp(): void
    {
        parent::setUp();

        $this->sales = app(SaleService::class);
    }

    public function test_a_sale_lowers_the_stock_and_computes_the_change(): void
    {
        $variant = ProductVariant::factory()->withStock(10, 20000)->create([
            'selling_price' => 35000,
        ]);

        $sale = $this->sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 2],
        ], [
            'amount_paid' => 100000,
            'payment_method' => PaymentMethod::Especes->value,
        ]);

        $this->assertSame(70000, $sale->total);
        $this->assertSame(30000, $sale->change_due);
        $this->assertSame(8, $variant->fresh()->stock_quantity);
    }

    /**
     * Le prix de revient est figé à la vente : changer le prix d'achat plus
     * tard ne doit pas réécrire la marge des ventes passées.
     */
    public function test_the_cost_price_is_frozen_on_the_sale(): void
    {
        $variant = ProductVariant::factory()->withStock(5, 20000)->create([
            'selling_price' => 35000,
        ]);

        $sale = $this->sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);

        $variant->update(['cost_price' => 99000]);

        $this->assertSame(20000, $sale->fresh()->total_cost);
        $this->assertSame(15000, $sale->fresh()->profit);
    }

    public function test_scanning_the_same_article_twice_makes_a_single_line(): void
    {
        $variant = ProductVariant::factory()->withStock(10)->create([
            'selling_price' => 10000,
        ]);

        $sale = $this->sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);

        $this->assertCount(1, $sale->items);
        $this->assertSame(2, $sale->items->first()->quantity);
        $this->assertSame(8, $variant->fresh()->stock_quantity);
    }

    public function test_a_sale_beyond_the_available_stock_is_refused(): void
    {
        $variant = ProductVariant::factory()->withStock(1)->create();

        $this->expectException(RuntimeException::class);

        $this->sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 5],
        ]);
    }

    /** Le refus doit être total : ni vente ni mouvement partiel enregistré. */
    public function test_a_refused_sale_leaves_no_trace(): void
    {
        $ok = ProductVariant::factory()->withStock(10)->create();
        $short = ProductVariant::factory()->withStock(1)->create();

        try {
            $this->sales->create([
                ['product_variant_id' => $ok->id, 'quantity' => 2],
                ['product_variant_id' => $short->id, 'quantity' => 9],
            ]);
        } catch (RuntimeException) {
            // attendu
        }

        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertSame(10, $ok->fresh()->stock_quantity);
    }

    public function test_discounts_are_applied_line_by_line_then_globally(): void
    {
        $variant = ProductVariant::factory()->withStock(10)->create([
            'selling_price' => 20000,
        ]);

        $sale = $this->sales->create([
            [
                'product_variant_id' => $variant->id,
                'quantity' => 3,
                'discount' => 5000,
            ],
        ], ['discount' => 1000]);

        $this->assertSame(60000, $sale->subtotal);
        $this->assertSame(6000, $sale->discount);
        $this->assertSame(54000, $sale->total);
    }

    public function test_a_discount_larger_than_the_line_is_refused(): void
    {
        $variant = ProductVariant::factory()->withStock(5)->create([
            'selling_price' => 10000,
        ]);

        $this->expectException(RuntimeException::class);

        $this->sales->create([
            [
                'product_variant_id' => $variant->id,
                'quantity' => 1,
                'discount' => 50000,
            ],
        ]);
    }

    public function test_cancelling_a_sale_puts_the_goods_back_in_stock(): void
    {
        $variant = ProductVariant::factory()->withStock(10)->create();

        $sale = $this->sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 4],
        ]);

        $this->assertSame(6, $variant->fresh()->stock_quantity);

        $this->sales->cancel($sale);

        $this->assertSame(10, $variant->fresh()->stock_quantity);
        $this->assertSame(SaleStatus::Annulee, $sale->fresh()->status);
    }

    public function test_a_cancelled_sale_cannot_be_cancelled_again(): void
    {
        $variant = ProductVariant::factory()->withStock(5)->create();

        $sale = $this->sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);

        $this->sales->cancel($sale);

        $this->expectException(RuntimeException::class);

        $this->sales->cancel($sale->fresh());
    }

    public function test_sale_numbers_follow_each_other_within_the_year(): void
    {
        $variant = ProductVariant::factory()->withStock(10)->create();

        $first = $this->sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);
        $second = $this->sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);

        $year = now()->format('Y');

        $this->assertSame("V-{$year}-000001", $first->reference);
        $this->assertSame("V-{$year}-000002", $second->reference);
    }

    /*
    |--------------------------------------------------------------------------
    | Client créé depuis la caisse
    |--------------------------------------------------------------------------
    */

    /** Le vendeur crée un client sans quitter l'écran, panier intact. */
    public function test_a_customer_can_be_created_from_the_till(): void
    {
        $vendeur = User::factory()->create(['role' => UserRole::Vendeur->value]);

        $this->actingAs($vendeur)
            ->post('/caisse/client', [
                'name' => 'Awa Sarr',
                'phone' => '77 123 45 67',
            ])
            ->assertRedirect();

        $client = Customer::firstOrFail();

        $this->assertSame('Awa Sarr', $client->name);
        $this->assertTrue($client->is_active);
        // L'identifiant revient en session pour que la caisse le
        // présélectionne sur la vente en cours.
        $this->assertSame($client->id, session('nouveauClient'));
    }

    /**
     * Un numéro déjà connu ne crée pas un doublon : c'est exactement le genre
     * de fiche que quelqu'un devrait fusionner plus tard.
     */
    public function test_a_known_phone_number_reuses_the_existing_record(): void
    {
        $vendeur = User::factory()->create(['role' => UserRole::Vendeur->value]);

        $existant = Customer::create([
            'type' => 'particulier',
            'name' => 'Awa Sarr',
            'phone' => '+221 77 123 45 67',
            'is_active' => true,
        ]);

        $this->actingAs($vendeur)
            ->post('/caisse/client', [
                'name' => 'Awa S.',
                'phone' => '77 123 45 67',
            ])
            ->assertRedirect();

        $this->assertDatabaseCount('customers', 1);
        $this->assertSame($existant->id, session('nouveauClient'));
    }

    public function test_an_empty_sale_is_refused(): void
    {
        $this->expectException(RuntimeException::class);

        $this->sales->create([]);
    }

    public function test_the_sale_is_linked_to_its_stock_movements(): void
    {
        $variant = ProductVariant::factory()->withStock(5)->create();

        $sale = $this->sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 2],
        ]);

        $movement = $sale->movements()->first();

        $this->assertNotNull($movement);
        $this->assertSame(-2, $movement->quantity);
        $this->assertSame(Sale::class, $movement->reference_type);
    }
}
