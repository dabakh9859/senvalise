<?php

namespace App\Models;

use App\Enums\RefundMethod;
use App\Enums\ReturnReason;
use App\Services\ReferenceGenerator;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $reference
 * @property int|null $sale_id
 * @property int|null $customer_id
 * @property int|null $user_id
 * @property Carbon $returned_at
 * @property ReturnReason $reason
 * @property RefundMethod $refund_method
 * @property int $total_refund
 * @property Carbon|null $credit_used_at
 * @property string|null $note
 * @property-read Sale|null $sale
 * @property-read Customer|null $customer
 * @property-read User|null $user
 * @property-read Collection<int, SaleReturnItem> $items
 */
#[Fillable([
    'reference', 'sale_id', 'customer_id', 'user_id', 'returned_at',
    'reason', 'refund_method', 'total_refund', 'credit_used_at', 'note',
])]
class SaleReturn extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'returned_at' => 'datetime',
            'credit_used_at' => 'datetime',
            'reason' => ReturnReason::class,
            'refund_method' => RefundMethod::class,
            'total_refund' => 'integer',
        ];
    }

    /** @return BelongsTo<Sale, $this> */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
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

    /** @return HasMany<SaleReturnItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(SaleReturnItem::class);
    }

    /** @return MorphMany<StockMovement, $this> */
    public function movements(): MorphMany
    {
        return $this->morphMany(StockMovement::class, 'reference');
    }

    /** Avoir encore du au client. */
    public function isOpenCredit(): bool
    {
        return $this->refund_method === RefundMethod::Avoir && $this->credit_used_at === null;
    }

    /** @param  Builder<self>  $query */
    public function scopeOpenCredit(Builder $query): void
    {
        $query->where('refund_method', RefundMethod::Avoir)->whereNull('credit_used_at');
    }

    /** R-2026-000001 */
    public static function nextReference(?int $year = null): string
    {
        $year ??= (int) now()->format('Y');
        $prefix = "R-{$year}-";

        return app(ReferenceGenerator::class)->next("returns:{$year}", $prefix, 6, 'sale_returns');
    }
}
