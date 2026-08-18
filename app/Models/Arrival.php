<?php

namespace App\Models;

use App\Enums\ArrivalStatus;
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
 * @property int|null $supplier_id
 * @property Carbon|null $arrival_date
 * @property ArrivalStatus $status
 * @property string $currency
 * @property string $exchange_rate
 * @property int $goods_cost
 * @property int $shipping_cost
 * @property int $customs_cost
 * @property int $other_cost
 * @property int $total_cost
 * @property int $total_quantity
 * @property string|null $notes
 * @property int|null $user_id
 * @property Carbon|null $received_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Supplier|null $supplier
 * @property-read User|null $user
 * @property-read Collection<int, ArrivalItem> $items
 * @property-read int $extra_costs
 */
#[Fillable([
    'reference', 'supplier_id', 'arrival_date', 'status', 'currency', 'exchange_rate',
    'goods_cost', 'shipping_cost', 'customs_cost', 'other_cost', 'total_cost',
    'total_quantity', 'notes', 'user_id', 'received_at',
])]
class Arrival extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'arrival_date' => 'date',
            'received_at' => 'datetime',
            'status' => ArrivalStatus::class,
            'exchange_rate' => 'decimal:6',
            'goods_cost' => 'integer',
            'shipping_cost' => 'integer',
            'customs_cost' => 'integer',
            'other_cost' => 'integer',
            'total_cost' => 'integer',
            'total_quantity' => 'integer',
        ];
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<ArrivalItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(ArrivalItem::class);
    }

    /** @return MorphMany<StockMovement, $this> */
    public function movements(): MorphMany
    {
        return $this->morphMany(StockMovement::class, 'reference');
    }

    /**
     * Total des frais annexes répartis sur la marchandise.
     *
     * @return Attribute<int, never>
     */
    protected function extraCosts(): Attribute
    {
        return Attribute::get(fn (): int => $this->shipping_cost + $this->customs_cost + $this->other_cost);
    }

    public function isDraft(): bool
    {
        return $this->status === ArrivalStatus::Brouillon;
    }

    public function isReceived(): bool
    {
        return $this->status === ArrivalStatus::Receptionne;
    }

    /** @param  Builder<self>  $query */
    public function scopeReceived(Builder $query): void
    {
        $query->where('status', ArrivalStatus::Receptionne);
    }

    /** ARR-2026-0001 */
    public static function nextReference(?int $year = null): string
    {
        $year ??= (int) now()->format('Y');
        $prefix = "ARR-{$year}-";

        return app(ReferenceGenerator::class)->next("arrivals:{$year}", $prefix, 4, 'arrivals');
    }
}
