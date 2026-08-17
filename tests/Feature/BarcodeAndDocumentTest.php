<?php

namespace Tests\Feature;

use App\Enums\DocumentStatus;
use App\Enums\DocumentType;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\DocumentService;
use App\Services\SaleService;
use App\Support\Barcode;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class BarcodeAndDocumentTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_generated_barcode_is_a_valid_ean13(): void
    {
        $code = Barcode::forVariant(1);

        $this->assertMatchesRegularExpression('/^\d{13}$/', $code);
        $this->assertTrue(Barcode::isValid($code));
        $this->assertStringStartsWith('200', $code);
    }

    public function test_two_articles_never_share_a_barcode(): void
    {
        $codes = collect(range(1, 50))->map(fn (int $id) => Barcode::forVariant($id));

        $this->assertCount(50, $codes->unique());
    }

    public function test_a_wrong_check_digit_is_rejected(): void
    {
        $valid = Barcode::forVariant(7);
        $lastDigit = (int) substr($valid, -1);
        $broken = substr($valid, 0, 12).(($lastDigit + 1) % 10);

        $this->assertFalse(Barcode::isValid($broken));
    }

    public function test_a_new_article_gets_a_barcode_automatically(): void
    {
        $variant = ProductVariant::factory()->withBarcode()->create();

        $this->assertTrue(Barcode::isValid((string) $variant->fresh()->barcode));
    }

    public function test_amounts_are_formatted_without_decimals(): void
    {
        // Le franc CFA n'a pas de centimes.
        $this->assertSame("45 000\u{00A0}FCFA", Money::format(45000));
        $this->assertSame('45 000', Money::format(45000, false));
        $this->assertSame(45000, Money::parse('45 000 FCFA'));
    }

    public function test_a_quote_totals_correctly_with_tax(): void
    {
        $documents = app(DocumentService::class);
        $variant = ProductVariant::factory()->create(['selling_price' => 50000]);

        $document = $documents->create(DocumentType::Devis, [
            'issue_date' => now()->toDateString(),
            'tax_rate' => 18,
            'discount' => 10000,
        ], [
            [
                'product_variant_id' => $variant->id,
                'designation' => 'Valise cabine',
                'quantity' => 2,
                'unit_price' => 50000,
            ],
        ]);

        $this->assertSame(100000, $document->subtotal);
        $this->assertSame(16200, $document->tax_amount); // 18 % de 90 000
        $this->assertSame(106200, $document->total);
    }

    public function test_a_quote_becomes_an_invoice_keeping_its_lines(): void
    {
        $documents = app(DocumentService::class);
        $customer = Customer::create(['name' => 'Fatou Ndiaye', 'phone' => '77 000 00 00']);

        $quote = $documents->create(DocumentType::Devis, [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
        ], [
            ['designation' => 'Valise cabine', 'quantity' => 2, 'unit_price' => 40000],
            ['designation' => 'Cadenas TSA', 'quantity' => 1, 'unit_price' => 3500],
        ]);

        $invoice = $documents->convert($quote, DocumentType::Facture);

        $this->assertSame(DocumentType::Facture, $invoice->type);
        $this->assertSame($quote->id, $invoice->parent_document_id);
        $this->assertCount(2, $invoice->items);
        $this->assertSame($quote->total, $invoice->total);
        $this->assertSame($customer->id, $invoice->customer_id);
        $this->assertStringStartsWith('FA-', $invoice->reference);
    }

    public function test_a_delivery_note_cannot_become_a_quote(): void
    {
        $documents = app(DocumentService::class);

        $note = $documents->create(DocumentType::BonLivraison, [
            'issue_date' => now()->toDateString(),
        ], [
            ['designation' => 'Valise', 'quantity' => 1, 'unit_price' => 10000],
        ]);

        $this->expectException(RuntimeException::class);

        $documents->convert($note, DocumentType::Devis);
    }

    public function test_an_invoice_can_be_issued_from_a_sale(): void
    {
        $variant = ProductVariant::factory()->withStock(5)->create([
            'selling_price' => 25000,
        ]);

        $sale = app(SaleService::class)->create([
            ['product_variant_id' => $variant->id, 'quantity' => 2],
        ]);

        $invoice = app(DocumentService::class)->fromSale($sale);

        $this->assertSame(50000, $invoice->total);
        $this->assertSame($sale->id, $invoice->sale_id);
        $this->assertSame(DocumentStatus::Paye, $invoice->status);
    }

    public function test_the_printable_document_and_pdf_are_served(): void
    {
        $user = User::factory()->create();
        $documents = app(DocumentService::class);

        $invoice = $documents->create(DocumentType::Facture, [
            'issue_date' => now()->toDateString(),
            'customer_name' => 'Moussa Diop',
        ], [
            ['designation' => 'Valise 75cm', 'quantity' => 1, 'unit_price' => 75000],
        ]);

        $this->actingAs($user)
            ->get("/documents/{$invoice->id}/impression")
            ->assertOk()
            ->assertSee('Moussa Diop')
            ->assertSee($invoice->reference);

        $pdf = $this->actingAs($user)->get("/documents/{$invoice->id}/pdf");

        $pdf->assertOk();
        $this->assertSame('application/pdf', $pdf->headers->get('content-type'));
    }

    /**
     * Une facture longue tient sur plusieurs pages, et la numerotation est
     * ajoutee apres coup sur le canevas : ce chemin de code ne s'execute que
     * la, il merite d'etre parcouru au moins une fois.
     */
    public function test_a_long_invoice_is_paginated(): void
    {
        $user = User::factory()->create();

        $lines = [];

        for ($i = 1; $i <= 30; $i++) {
            $lines[] = [
                'designation' => "Valise modele {$i}",
                'quantity' => 1,
                'unit_price' => 75000,
            ];
        }

        $invoice = app(DocumentService::class)->create(DocumentType::Facture, [
            'issue_date' => now()->toDateString(),
            'customer_name' => 'Boutique Sahel',
        ], $lines);

        $response = $this->actingAs($user)->get("/documents/{$invoice->id}/pdf");

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $response->getContent());
    }

    /** Le gabarit porte les couleurs de la marque : bleu de fond, jaune en filet. */
    public function test_the_printable_document_carries_the_brand_colours(): void
    {
        $user = User::factory()->create();

        $invoice = app(DocumentService::class)->create(DocumentType::Facture, [
            'issue_date' => now()->toDateString(),
            'customer_name' => 'Moussa Diop',
        ], [
            ['designation' => 'Valise 75cm', 'quantity' => 1, 'unit_price' => 75000],
        ]);

        $this->actingAs($user)
            ->get("/documents/{$invoice->id}/impression")
            ->assertOk()
            ->assertSee('#1f3fe0', escape: false)
            ->assertSee('#efac10', escape: false)
            ->assertSee('Total à payer');
    }

    public function test_the_label_sheet_renders_the_selected_barcodes(): void
    {
        $user = User::factory()->create();
        $variant = ProductVariant::factory()->withStock(3)->withBarcode()->create();
        $variant->refresh();

        $this->actingAs($user)
            ->get("/etiquettes/planche?ids={$variant->id}&quantites={$variant->id}:3&format=a4-3x8")
            ->assertOk()
            ->assertSee('3 étiquettes')
            ->assertSee('<svg', false);
    }

    public function test_the_receipt_is_printable(): void
    {
        $user = User::factory()->create();
        $variant = ProductVariant::factory()->withStock(5)->create([
            'selling_price' => 12000,
        ]);

        $sale = app(SaleService::class)->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);

        $this->actingAs($user)
            ->get("/ventes/{$sale->id}/ticket")
            ->assertOk()
            ->assertSee($sale->reference)
            ->assertSee('SenValise');
    }
}
