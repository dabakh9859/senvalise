<?php

namespace Tests\Feature;

use App\Enums\DocumentStatus;
use App\Enums\DocumentType;
use App\Enums\PaymentMethod;
use App\Enums\UserRole;
use App\Models\Customer;
use App\Models\Document;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Vendre et facturer sont le meme geste : la caisse edite la piece elle-meme.
 */
class SaleInvoiceTest extends TestCase
{
    use RefreshDatabase;

    protected function vendeur(): User
    {
        return User::factory()->create(['role' => UserRole::Vendeur->value]);
    }

    /** @param  array<string, mixed>  $extra */
    protected function encaisser(User $user, ProductVariant $variant, array $extra = []): TestResponse
    {
        return $this->actingAs($user)->post('/vente/enregistrer', [
            'lines' => [[
                'product_variant_id' => $variant->id,
                'quantity' => 1,
                'unit_price' => $variant->selling_price,
            ]],
            'payment_method' => PaymentMethod::Especes->value,
            ...$extra,
        ]);
    }

    public function test_a_sale_edits_its_invoice_and_lands_on_it(): void
    {
        $vendeur = $this->vendeur();
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 60000]);

        $this->encaisser($vendeur, $variant)->assertRedirect();

        $sale = Sale::firstOrFail();
        $document = Document::firstOrFail();

        $this->assertSame(DocumentType::Facture, $document->type);
        $this->assertSame($sale->id, $document->sale_id);
        $this->assertSame(60000, $document->total);
        $this->assertSame(1, $document->items()->count());

        $this->encaisser($vendeur, $variant)->assertRedirect('/documents/'.($document->id + 1));
    }

    public function test_a_cash_sale_produces_a_paid_invoice(): void
    {
        $vendeur = $this->vendeur();
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 60000]);

        $this->encaisser($vendeur, $variant, ['amount_paid' => 100000]);

        $document = Document::firstOrFail();

        $this->assertSame(DocumentStatus::Paye, $document->status);
        // Le client a pose 100 000 et repart avec la monnaie : la facture ne
        // doit pas afficher un trop-percu de 40 000.
        $this->assertSame(60000, $document->amount_paid);
        $this->assertSame(0, $document->balance_due);
    }

    /** Une vente a credit produit une facture due, pas une facture payee. */
    public function test_a_credit_sale_produces_an_unpaid_invoice(): void
    {
        $vendeur = $this->vendeur();
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 80000]);

        $this->encaisser($vendeur, $variant, [
            'payment_method' => PaymentMethod::ACredit->value,
            'amount_paid' => 0,
        ]);

        $document = Document::firstOrFail();

        $this->assertSame(DocumentStatus::Envoye, $document->status);
        $this->assertSame(80000, $document->balance_due);
    }

    public function test_a_partial_payment_produces_a_partly_paid_invoice(): void
    {
        $vendeur = $this->vendeur();
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 80000]);

        $this->encaisser($vendeur, $variant, ['amount_paid' => 30000]);

        $document = Document::firstOrFail();

        $this->assertSame(DocumentStatus::PartiellementPaye, $document->status);
        $this->assertSame(50000, $document->balance_due);
    }

    public function test_the_invoice_carries_the_customer_of_the_sale(): void
    {
        $vendeur = $this->vendeur();
        $customer = Customer::create([
            'name' => 'Awa Sow',
            'type' => 'particulier',
            'phone' => '77 123 45 67',
            'is_active' => true,
        ]);
        $variant = ProductVariant::factory()->withStock(5)->create(['selling_price' => 25000]);

        $this->encaisser($vendeur, $variant, ['customer_id' => $customer->id]);

        $document = Document::firstOrFail();

        $this->assertSame($customer->id, $document->customer_id);
        $this->assertSame('Awa Sow', $document->customer_name);
    }

    /** Panier refuse : ni vente, ni facture orpheline. */
    public function test_a_refused_sale_leaves_no_invoice_behind(): void
    {
        $vendeur = $this->vendeur();
        $variant = ProductVariant::factory()->withStock(0)->create(['selling_price' => 25000]);

        $this->actingAs($vendeur)->post('/vente/enregistrer', [
            'lines' => [[
                'product_variant_id' => $variant->id,
                'quantity' => 3,
                'unit_price' => 25000,
            ]],
            'payment_method' => PaymentMethod::Especes->value,
        ]);

        $this->assertDatabaseCount('sales', 0);
        $this->assertDatabaseCount('documents', 0);
    }

    /** La liste des factures porte de quoi ouvrir le comptoir. */
    public function test_the_documents_list_carries_the_counter(): void
    {
        ProductVariant::factory()->withStock(5)->create(['selling_price' => 25000]);

        $this->actingAs($this->vendeur())
            ->get('/documents')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('documents/index')
                ->where('openCounter', false)
                ->has('catalogue', 1)
                ->has('paymentMethods')
                ->has('categories'));
    }
}
