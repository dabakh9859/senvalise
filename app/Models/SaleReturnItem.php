<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $sale_return_id
 * @property int|null $product_variant_id
 * @property string $designation
 * @property int $quantity
 * @property int $unit_price
 * @property int $line_total
 * @property bool $restocked
 */
#[Fillable([
    'sale_return_id', 'product_variant_id', 'designation',
    'quantity', 'unit_price', 'line_total', 'restocked',
])]
class SaleReturnItem extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price' => 'integer',
            'line_total' => 'integer',
            'restocked' => 'boolean',
        ];
    }

    /** @return BelongsTo<SaleReturn, $this> */
    public function saleReturn(): BelongsTo
    {
        return $this->belongsTo(SaleReturn::class);
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}
