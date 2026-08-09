<?php

namespace App\Models;

use App\Enums\DocumentStatus;
use App\Enums\DocumentType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Devis, facture et bon de livraison. Le chaînage se fait par
 * parent_document_id : un devis accepté engendre une facture, qui engendre
 * un bon de livraison.
 *
 * @property int $id
 * @property DocumentType $type
 * @property string $reference
 * @property int|null $customer_id
 * @property int|null $sale_id
 * @property int|null $parent_document_id
 * @property Carbon|null $issue_date
 * @property Carbon|null $valid_until
 * @property Carbon|null $due_date
 * @property Carbon|null $delivery_date
 * @property DocumentStatus $status
 * @property string|null $customer_name
 * @property string|null $customer_phone
 * @property string|null $customer_address
 * @property int $subtotal
 * @property int $discount
 * @property string $tax_rate
 * @property int $tax_amount
 * @property int $total
 * @property int $amount_paid
 * @property string|null $notes
 * @property string|null $terms
 * @property int|null $user_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer|null $customer
 * @property-read Sale|null $sale
 * @property-read User|null $user
 * @property-read Document|null $parent
 * @property-read Collection<int, Document> $children
 * @property-read Collection<int, DocumentItem> $items
 * @property-read int $balance_due
 */
#[Fillable([
    'type', 'reference', 'customer_id', 'sale_id', 'parent_document_id',
    'issue_date', 'valid_until', 'due_date', 'delivery_date', 'status',
    'customer_name', 'customer_phone', 'customer_address',
    'subtotal', 'discount', 'tax_rate', 'tax_amount', 'total', 'amount_paid',
    'notes', 'terms', 'user_id',
])]
class Document extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'type' => DocumentType::class,
            'status' => DocumentStatus::class,
            'issue_date' => 'date',
            'valid_until' => 'date',
            'due_date' => 'date',
            'delivery_date' => 'date',
            'subtotal' => 'integer',
            'discount' => 'integer',
            'tax_rate' => 'decimal:2',
            'tax_amount' => 'integer',
            'total' => 'integer',
            'amount_paid' => 'integer',
        ];
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<Sale, $this> */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<self, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_document_id');
    }

    /** @return HasMany<self, $this> */
    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_document_id');
    }

    /** @return HasMany<DocumentItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(DocumentItem::class)->orderBy('position')->orderBy('id');
    }

    /**
     * Reste à payer sur une facture.
     *
     * @return Attribute<int<0, max>, never>
     */
    protected function balanceDue(): Attribute
    {
        return Attribute::get(fn (): int => max(0, $this->total - $this->amount_paid));
    }

    /** @param  Builder<self>  $query */
    public function scopeOfType(Builder $query, DocumentType|string $type): void
    {
        $query->where('type', $type instanceof DocumentType ? $type->value : $type);
    }

    /** DEV-2026-0001 / FA-2026-0001 / BL-2026-0001 */
    public static function nextReference(DocumentType $type, ?int $year = null): string
    {
        $year ??= (int) now()->format('Y');
        $prefix = "{$type->prefix()}-{$year}-";

        $last = static::query()
            ->where('reference', 'like', $prefix.'%')
            ->orderByDesc('reference')
            ->value('reference');

        $number = is_string($last) ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix.str_pad((string) $number, 4, '0', STR_PAD_LEFT);
    }
}
