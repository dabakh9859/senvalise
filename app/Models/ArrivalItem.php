<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $arrival_id
 * @property int $product_variant_id
 * @property int $quantity
 * @property string $unit_cost
 * @property int $unit_cost_xof
 * @property int $landed_unit_cost
 * @property int $line_total
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Arrival|null $arrival
 * @property-read ProductVariant|null $variant
 */
#[Fillable([
    'arrival_id', 'product_variant_id', 'quantity',
    'unit_cost', 'unit_cost_xof', 'landed_unit_cost', 'line_total',
])]
class ArrivalItem extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_cost' => 'decimal:4',
            'unit_cost_xof' => 'integer',
            'landed_unit_cost' => 'integer',
            'line_total' => 'integer',
        ];
    }

    /** @return BelongsTo<Arrival, $this> */
    public function arrival(): BelongsTo
    {
        return $this->belongsTo(Arrival::class);
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}
