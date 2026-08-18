<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use App\Enums\SaleChannel;
use App\Enums\SaleStatus;
use App\Services\ReferenceGenerator;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $reference
 * @property SaleChannel $channel
 * @property int|null $customer_id
 * @property int|null $user_id
 * @property Carbon|null $sold_at
 * @property int $subtotal
 * @property int $discount
 * @property int $total
 * @property int $amount_paid
 * @property int $change_due
 * @property int $total_cost
 * @property PaymentMethod $payment_method
 * @property SaleStatus $status
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer|null $customer
 * @property-read User|null $user
 * @property-read Collection<int, SaleItem> $items
 * @property-read Collection<int, Document> $documents
 * @property-read int $profit
 */
#[Fillable([
    'reference', 'channel', 'customer_id', 'user_id', 'sold_at',
    'subtotal', 'discount', 'total', 'amount_paid', 'change_due', 'total_cost',
    'payment_method', 'status', 'note',
])]
class Sale extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'sold_at' => 'datetime',
            'channel' => SaleChannel::class,
            'payment_method' => PaymentMethod::class,
            'status' => SaleStatus::class,
            'subtotal' => 'integer',
            'discount' => 'integer',
            'total' => 'integer',
            'amount_paid' => 'integer',
            'change_due' => 'integer',
            'total_cost' => 'integer',
        ];
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<SaleItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    /** @return HasMany<Document, $this> */
    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    /** @return MorphMany<StockMovement, $this> */
    public function movements(): MorphMany
    {
        return $this->morphMany(StockMovement::class, 'reference');
    }

    /**
     * Marge dégagée sur la vente (prix de vente - prix de revient figé).
     *
     * @return Attribute<int, never>
     */
    protected function profit(): Attribute
    {
        return Attribute::get(fn (): int => $this->total - $this->total_cost);
    }

    /** @param  Builder<self>  $query */
    public function scopeValid(Builder $query): void
    {
        $query->where('status', SaleStatus::Validee);
    }

    /** @param  Builder<self>  $query */
    public function scopeBetween(Builder $query, mixed $from, mixed $to): void
    {
        $query->whereBetween('sold_at', [$from, $to]);
    }

    /** V-2026-000001 */
    public static function nextReference(?int $year = null): string
    {
        $year ??= (int) now()->format('Y');
        $prefix = "V-{$year}-";

        return app(ReferenceGenerator::class)->next("sales:{$year}", $prefix, 6, 'sales');
    }
}
