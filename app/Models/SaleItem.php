<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $sale_id
 * @property int|null $product_variant_id
 * @property string $designation
 * @property string|null $sku
 * @property string|null $barcode
 * @property int $quantity
 * @property int $unit_price
 * @property int $discount
 * @property int $line_total
 * @property int $unit_cost
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Sale|null $sale
 * @property-read ProductVariant|null $variant
 * @property-read int $profit
 */
#[Fillable([
    'sale_id', 'product_variant_id', 'designation', 'sku', 'barcode',
    'quantity', 'unit_price', 'discount', 'line_total', 'unit_cost',
])]
class SaleItem extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price' => 'integer',
            'discount' => 'integer',
            'line_total' => 'integer',
            'unit_cost' => 'integer',
        ];
    }

    /** @return BelongsTo<Sale, $this> */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /** @return Attribute<int, never> */
    protected function profit(): Attribute
    {
        return Attribute::get(fn (): int => $this->line_total - ($this->unit_cost * $this->quantity));
    }
}
