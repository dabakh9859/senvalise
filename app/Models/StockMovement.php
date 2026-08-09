<?php

namespace App\Models;

use App\Enums\MovementReason;
use App\Enums\MovementType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $product_variant_id
 * @property MovementType $type
 * @property MovementReason $reason
 * @property int $quantity
 * @property int $quantity_before
 * @property int $quantity_after
 * @property int|null $unit_cost
 * @property string|null $reference_type
 * @property int|null $reference_id
 * @property int|null $user_id
 * @property string|null $note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read ProductVariant|null $variant
 * @property-read User|null $user
 */
#[Fillable([
    'product_variant_id', 'type', 'reason', 'quantity',
    'quantity_before', 'quantity_after', 'unit_cost',
    'reference_type', 'reference_id', 'user_id', 'note',
])]
class StockMovement extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'type' => MovementType::class,
            'reason' => MovementReason::class,
            'quantity' => 'integer',
            'quantity_before' => 'integer',
            'quantity_after' => 'integer',
            'unit_cost' => 'integer',
        ];
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return MorphTo<Model, $this> */
    public function reference(): MorphTo
    {
        return $this->morphTo();
    }

    /** @param  Builder<self>  $query */
    public function scopeBetween(Builder $query, mixed $from, mixed $to): void
    {
        $query->whereBetween('created_at', [$from, $to]);
    }
}
