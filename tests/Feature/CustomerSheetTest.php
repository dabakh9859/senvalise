<?php

namespace Tests\Feature;

use App\Enums\PaymentMethod;
use App\Enums\RefundMethod;
use App\Enums\UserRole;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\ReturnService;
use App\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerSheetTest extends TestCase
{
    use RefreshDatabase;

    protected function customer(): Customer
    {
        return Customer::create([
            'name' => 'Awa Sow',
            'type' => 'particulier',
            'phone' => '77 123 45 67',
            'is_active' => true,
        ]);
    }

    public function test_the_sheet_sums_up_what_the_customer_bought(): void
    {
        $vendeur = User::factory()->create(['role' => UserRole::Vendeur->value]);
        $customer = $this->customer();
        $variant = ProductVariant::factory()->withStock(10)->create(['selling_price' => 50000]);

        $this->actingAs($vendeur);
        app(SaleService::class)->create(
            [['product_variant_id' => $variant->id, 'quantity' => 2]],
            ['customer_id' => $customer->id],
        );

        $this->actingAs($vendeur)
            ->get("/clients/{$customer->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('clients/show')
                ->where('summary.revenue', 100000)
                ->where('summary.salesCount', 1)
                ->where('summary.averageBasket', 100000)
                ->where('summary.outstanding', 0));
    }

    /** Une vente a credit reste due : c'est le chiffre qu'on cherche a l'accueil. */
    public function test_a_credit_sale_shows_up_as_outstanding(): void
    {
        $vendeur = User::factory()->create(['role' => UserRole::Vendeur->value]);
        $customer = $this->customer();
        $variant = ProductVariant::factory()->withStock(10)->create(['selling_price' => 80000]);

        $this->actingAs($vendeur);
        app(SaleService::class)->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1]],
            [
                'customer_id' => $customer->id,
                'payment_method' => PaymentMethod::ACredit->value,
                'amount_paid' => 30000,
            ],
        );

        $this->actingAs($vendeur)
            ->get("/clients/{$customer->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('summary.outstanding', 50000));
    }

    public function test_an_unused_credit_note_is_flagged_on_the_sheet(): void
    {
        $vendeur = User::factory()->create(['role' => UserRole::Vendeur->value]);
        $customer = $this->customer();
        $variant = ProductVariant::factory()->withStock(10)->create(['selling_price' => 25000]);

        $this->actingAs($vendeur);
        app(ReturnService::class)->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 25000]],
            ['customer_id' => $customer->id, 'refund_method' => RefundMethod::Avoir->value],
        );

        $this->actingAs($vendeur)
            ->get("/clients/{$customer->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('summary.openCredit', 25000)
                ->where('summary.returnsCount', 1));
    }

    /** Le vendeur ne voit pas la marge, ici comme partout ailleurs. */
    public function test_the_seller_sees_no_margin_on_the_sheet(): void
    {
        $customer = $this->customer();

        $this->actingAs(User::factory()->create(['role' => UserRole::Vendeur->value]))
            ->get("/clients/{$customer->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('summary.margin', null)
                ->where('canOpenShop', false));

        $this->actingAs(User::factory()->create(['role' => UserRole::Gerant->value]))
            ->get("/clients/{$customer->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('canOpenShop', true));
    }
}
