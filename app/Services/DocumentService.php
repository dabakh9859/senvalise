<?php

namespace App\Services;

use App\Enums\DocumentStatus;
use App\Enums\DocumentType;
use App\Models\Customer;
use App\Models\Document;
use App\Models\DocumentItem;
use App\Models\Sale;
use App\Models\Setting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Devis, factures et bons de livraison.
 *
 * Un document ne touche jamais au stock : c'est un écrit commercial. Seule la
 * caisse (SaleService) fait bouger les quantités. Un bon de livraison peut donc
 * être édité avant ou après la vente sans risque de double décompte.
 */
class DocumentService
{
    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<int, array<string, mixed>>  $lines
     */
    public function create(DocumentType $type, array $attributes, array $lines): Document
    {
        return DB::transaction(function () use ($type, $attributes, $lines) {
            $customer = isset($attributes['customer_id'])
                ? Customer::query()->whereKey((int) $attributes['customer_id'])->first()
                : null;

            $document = Document::create([
                'type' => $type->value,
                'reference' => Document::nextReference($type),
                'customer_id' => $customer?->id,
                'sale_id' => $attributes['sale_id'] ?? null,
                'parent_document_id' => $attributes['parent_document_id'] ?? null,
                'issue_date' => $attributes['issue_date'] ?? now()->toDateString(),
                'valid_until' => $this->validUntil($type, $attributes),
                'due_date' => $attributes['due_date'] ?? null,
                'delivery_date' => $attributes['delivery_date'] ?? null,
                'status' => $attributes['status'] ?? DocumentStatus::Brouillon->value,
                'customer_name' => $attributes['customer_name'] ?? $customer?->displayName(),
                'customer_phone' => $attributes['customer_phone'] ?? $customer?->phone,
                'customer_address' => $attributes['customer_address'] ?? $customer?->address,
                'discount' => max(0, (int) ($attributes['discount'] ?? 0)),
                'tax_rate' => (float) ($attributes['tax_rate'] ?? Setting::get('tax_rate', 0)),
                'amount_paid' => max(0, (int) ($attributes['amount_paid'] ?? 0)),
                'notes' => $attributes['notes'] ?? null,
                'terms' => $attributes['terms'] ?? Setting::get('invoice_terms'),
                'user_id' => $attributes['user_id'] ?? Auth::id(),
            ]);

            $this->syncItems($document, $lines);

            return $document->fresh('items');
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @param  array<int, array<string, mixed>>  $lines
     */
    public function update(Document $document, array $attributes, array $lines): Document
    {
        return DB::transaction(function () use ($document, $attributes, $lines) {
            $customer = array_key_exists('customer_id', $attributes)
                ? Customer::query()->whereKey((int) $attributes['customer_id'])->first()
                : $document->customer;

            $document->update([
                'customer_id' => $customer?->id,
                'issue_date' => $attributes['issue_date'] ?? $document->issue_date,
                'valid_until' => $attributes['valid_until'] ?? $document->valid_until,
                'due_date' => $attributes['due_date'] ?? $document->due_date,
                'delivery_date' => $attributes['delivery_date'] ?? $document->delivery_date,
                'customer_name' => $attributes['customer_name'] ?? $customer?->displayName(),
                'customer_phone' => $attributes['customer_phone'] ?? $customer?->phone,
                'customer_address' => $attributes['customer_address'] ?? $customer?->address,
                'discount' => max(0, (int) ($attributes['discount'] ?? 0)),
                'tax_rate' => (float) ($attributes['tax_rate'] ?? $document->tax_rate),
                'amount_paid' => max(0, (int) ($attributes['amount_paid'] ?? $document->amount_paid)),
                'notes' => $attributes['notes'] ?? null,
                'terms' => $attributes['terms'] ?? null,
            ]);

            $this->syncItems($document, $lines);

            return $document->fresh('items');
        });
    }

    /** @param  array<int, array<string, mixed>>  $lines */
    public function syncItems(Document $document, array $lines): void
    {
        $document->items()->delete();

        foreach (array_values($lines) as $position => $line) {
            $quantity = max(1, (int) ($line['quantity'] ?? 1));
            $unitPrice = max(0, (int) ($line['unit_price'] ?? 0));
            $discount = max(0, (int) ($line['discount'] ?? 0));
            $gross = $unitPrice * $quantity;

            DocumentItem::create([
                'document_id' => $document->id,
                'product_variant_id' => $line['product_variant_id'] ?? null,
                'designation' => (string) ($line['designation'] ?? 'Article'),
                'description' => $line['description'] ?? null,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'discount' => min($discount, $gross),
                'line_total' => max(0, $gross - $discount),
                'position' => $position,
            ]);
        }

        $this->recalculate($document);
    }

    public function recalculate(Document $document): Document
    {
        $document->loadMissing('items');

        $subtotal = (int) $document->items->sum('line_total');
        $taxable = max(0, $subtotal - $document->discount);
        $taxAmount = (int) round($taxable * ((float) $document->tax_rate) / 100);

        $document->forceFill([
            'subtotal' => $subtotal,
            'tax_amount' => $taxAmount,
            'total' => $taxable + $taxAmount,
        ])->save();

        return $document;
    }

    /**
     * Transforme un document en un autre : devis accepté → facture, facture →
     * bon de livraison. Les lignes sont recopiées et le lien de filiation
     * conservé.
     */
    public function convert(Document $source, DocumentType $target): Document
    {
        $allowed = match ($source->type) {
            DocumentType::Devis => [DocumentType::Facture, DocumentType::BonLivraison],
            DocumentType::Facture => [DocumentType::BonLivraison],
            DocumentType::BonLivraison => [DocumentType::Facture],
        };

        if (! in_array($target, $allowed, true)) {
            throw new RuntimeException(
                "Un {$source->type->label()} ne peut pas être transformé en {$target->label()}."
            );
        }

        $source->loadMissing('items');

        $lines = $source->items->map(fn (DocumentItem $item) => [
            'product_variant_id' => $item->product_variant_id,
            'designation' => $item->designation,
            'description' => $item->description,
            'quantity' => $item->quantity,
            'unit_price' => $item->unit_price,
            'discount' => $item->discount,
        ])->all();

        return $this->create($target, [
            'customer_id' => $source->customer_id,
            'sale_id' => $source->sale_id,
            'parent_document_id' => $source->id,
            'issue_date' => now()->toDateString(),
            'due_date' => $target === DocumentType::Facture ? now()->addDays(30)->toDateString() : null,
            'delivery_date' => $target === DocumentType::BonLivraison ? now()->toDateString() : null,
            'customer_name' => $source->customer_name,
            'customer_phone' => $source->customer_phone,
            'customer_address' => $source->customer_address,
            'discount' => $source->discount,
            'tax_rate' => (float) $source->tax_rate,
            'notes' => $source->notes,
            'terms' => $source->terms,
        ], $lines);
    }

    /** Édite une facture à partir d'une vente déjà encaissée. */
    public function fromSale(Sale $sale, DocumentType $type = DocumentType::Facture): Document
    {
        $sale->loadMissing(['items', 'customer']);

        $lines = $sale->items->map(fn ($item) => [
            'product_variant_id' => $item->product_variant_id,
            'designation' => $item->designation,
            'quantity' => $item->quantity,
            'unit_price' => $item->unit_price,
            'discount' => $item->discount,
        ])->all();

        return $this->create($type, [
            'customer_id' => $sale->customer_id,
            'sale_id' => $sale->id,
            'issue_date' => $sale->sold_at?->toDateString() ?? now()->toDateString(),
            'delivery_date' => $type === DocumentType::BonLivraison ? now()->toDateString() : null,
            'discount' => $sale->discount,
            'amount_paid' => $sale->amount_paid,
            'status' => $type === DocumentType::Facture
                ? DocumentStatus::Paye->value
                : DocumentStatus::Brouillon->value,
            'notes' => "Établi d'après la vente {$sale->reference}.",
        ], $lines);
    }

    /** @param  array<string, mixed>  $attributes */
    protected function validUntil(DocumentType $type, array $attributes): ?string
    {
        if ($type !== DocumentType::Devis) {
            return $attributes['valid_until'] ?? null;
        }

        if (! empty($attributes['valid_until'])) {
            return $attributes['valid_until'];
        }

        $days = (int) Setting::get('quote_validity_days', 15);
        $issue = Carbon::parse($attributes['issue_date'] ?? now());

        return $issue->addDays($days)->toDateString();
    }
}
