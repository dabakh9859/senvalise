<?php

namespace Tests\Feature;

use App\Enums\CashCategory;
use App\Enums\RefundMethod;
use App\Enums\ReturnReason;
use App\Enums\UserRole;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleReturn;
use App\Models\User;
use App\Services\ReturnService;
use App\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class ReturnTest extends TestCase
{
    use RefreshDatabase;

    protected function vendeur(): User
    {
        return User::factory()->create(['role' => UserRole::Vendeur->value]);
    }

    protected function returns(): ReturnService
    {
        return app(ReturnService::class);
    }

    protected function sale(ProductVariant $variant, int $quantity = 1): Sale
    {
        return app(SaleService::class)->create([
            ['product_variant_id' => $variant->id, 'quantity' => $quantity],
        ]);
    }

    public function test_a_returned_article_goes_back_on_the_shelf(): void
    {
        $this->actingAs($this->vendeur());
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 40000]);
        $sale = $this->sale($variant);

        $this->assertSame(4, $variant->fresh()->stock_quantity);

        $return = $this->returns()->create(
            [[
                'product_variant_id' => $variant->id,
                'quantity' => 1,
                'unit_price' => 40000,
                'restocked' => true,
            ]],
            ['sale_id' => $sale->id, 'reason' => ReturnReason::Taille->value],
        );

        $this->assertSame(5, $variant->fresh()->stock_quantity);
        $this->assertSame(40000, $return->total_refund);
        $this->assertDatabaseHas('stock_movements', [
            'product_variant_id' => $variant->id,
            'reason' => 'retour_client',
            'quantity' => 1,
        ]);
    }

    /** Une valise cassee est remboursee mais ne repart pas en rayon. */
    public function test_a_faulty_article_is_refunded_without_being_restocked(): void
    {
        $this->actingAs($this->vendeur());
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 40000]);
        $sale = $this->sale($variant);

        $this->returns()->create(
            [[
                'product_variant_id' => $variant->id,
                'quantity' => 1,
                'unit_price' => 40000,
                'restocked' => false,
            ]],
            ['sale_id' => $sale->id, 'reason' => ReturnReason::Defaut->value],
        );

        $this->assertSame(4, $variant->fresh()->stock_quantity);
        $this->assertDatabaseMissing('stock_movements', ['reason' => 'retour_client']);
    }

    public function test_a_cash_refund_leaves_a_trace_in_the_till(): void
    {
        $this->actingAs($this->vendeur());
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 40000]);
        $sale = $this->sale($variant);

        $return = $this->returns()->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 40000]],
            ['sale_id' => $sale->id, 'refund_method' => RefundMethod::Especes->value],
        );

        $movement = CashMovement::first();

        $this->assertNotNull($movement);
        $this->assertSame(CashCategory::RemboursementClient, $movement->category);
        $this->assertSame('sortie', $movement->direction->value);
        $this->assertSame(40000, $movement->amount);
        $this->assertStringContainsString($return->reference, $movement->label);
    }

    /**
     * Un avoir ne sort pas d'argent : ecrire un mouvement de caisse ferait
     * reclamer un manquant qui n'existe pas a la fermeture.
     */
    public function test_a_credit_note_moves_no_money(): void
    {
        $this->actingAs($this->vendeur());
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 40000]);
        $sale = $this->sale($variant);

        $return = $this->returns()->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 40000]],
            ['sale_id' => $sale->id, 'refund_method' => RefundMethod::Avoir->value],
        );

        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertTrue($return->isOpenCredit());
    }

    public function test_a_credit_note_is_closed_once_consumed(): void
    {
        $this->actingAs($this->vendeur());
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 40000]);

        $return = $this->returns()->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 40000]],
            ['refund_method' => RefundMethod::Avoir->value],
        );

        $this->returns()->consumeCredit($return);

        $this->assertFalse($return->fresh()->isOpenCredit());

        $this->expectException(RuntimeException::class);
        $this->returns()->consumeCredit($return->fresh());
    }

    /** Le client de la vente prime : c'est lui qui a paye. */
    public function test_the_return_follows_the_customer_of_the_original_sale(): void
    {
        $this->actingAs($this->vendeur());
        $customer = Customer::create(['name' => 'Awa Sow', 'type' => 'particulier', 'is_active' => true]);
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 40000]);

        $sale = app(SaleService::class)->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1]],
            ['customer_id' => $customer->id],
        );

        $return = $this->returns()->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 40000]],
            ['sale_id' => $sale->id, 'customer_id' => null],
        );

        $this->assertSame($customer->id, $return->customer_id);
    }

    /** Le meme article ne doit pas pouvoir etre rendu deux fois sur un ticket. */
    public function test_the_lookup_deducts_what_was_already_returned(): void
    {
        $vendeur = $this->vendeur();
        $this->actingAs($vendeur);

        $variant = ProductVariant::factory()->withStock(10)->create(['selling_price' => 40000]);
        $sale = $this->sale($variant, 3);

        $this->returns()->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 40000]],
            ['sale_id' => $sale->id],
        );

        $this->actingAs($vendeur)
            ->getJson('/retours/recherche-vente?reference='.$sale->reference)
            ->assertOk()
            ->assertJsonPath('sale.items.0.alreadyReturned', 1)
            ->assertJsonPath('sale.items.0.returnable', 2);
    }

    public function test_an_empty_return_is_refused(): void
    {
        $this->actingAs($this->vendeur());

        $this->expectException(RuntimeException::class);
        $this->returns()->create([]);
    }

    public function test_a_return_is_recorded_from_the_screen(): void
    {
        $vendeur = $this->vendeur();
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 40000]);

        $this->actingAs($vendeur)
            ->post('/retours', [
                'lines' => [[
                    'product_variant_id' => $variant->id,
                    'quantity' => 1,
                    'unit_price' => 40000,
                    'restocked' => true,
                ]],
                'reason' => ReturnReason::NonSatisfait->value,
                'refund_method' => RefundMethod::Especes->value,
            ])
            ->assertRedirect();

        $this->assertDatabaseCount('sale_returns', 1);
        $this->assertSame(6, $variant->fresh()->stock_quantity);

        // La fiche du retour s'ouvre : « return » est un mot reserve de PHP,
        // le parametre de route porte ce nom et la liaison implicite doit
        // quand meme resoudre le modele.
        $return = SaleReturn::first();

        $this->actingAs($vendeur)
            ->get("/retours/{$return->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('retours/show')
                ->where('return.reference', $return->reference));
    }
}
