<?php

namespace App\Models;

use Database\Factories\ProductVariantFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * L'article réellement vendable : un modèle dans une taille et une couleur.
 * Porte le code-barres, le stock et les prix. Tous les montants sont en FCFA
 * entiers.
 *
 * @property int $id
 * @property int $product_id
 * @property string $sku
 * @property string|null $barcode
 * @property string|null $size
 * @property string|null $color
 * @property string|null $dimensions
 * @property string|null $weight_kg
 * @property int|null $capacity_l
 * @property int $cost_price
 * @property int $selling_price
 * @property int|null $web_price
 * @property int|null $compare_at_price
 * @property int $stock_quantity
 * @property int $reserved_quantity
 * @property int $low_stock_threshold
 * @property int $position
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Product|null $product
 * @property-read int $available_quantity
 * @property-read bool $is_low_stock
 * @property-read int $stock_value
 * @property-read int $margin_amount
 * @property-read float $margin_rate
 * @property-read string $variant_label
 */
#[Fillable([
    'product_id', 'sku', 'barcode', 'size', 'color', 'dimensions',
    'weight_kg', 'capacity_l', 'cost_price', 'selling_price', 'web_price',
    'compare_at_price', 'stock_quantity', 'reserved_quantity',
    'low_stock_threshold', 'position', 'is_active',
])]
class ProductVariant extends Model
{
    /** @use HasFactory<ProductVariantFactory> */
    use HasFactory;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'weight_kg' => 'decimal:2',
            'capacity_l' => 'integer',
            'cost_price' => 'integer',
            'selling_price' => 'integer',
            'web_price' => 'integer',
            'compare_at_price' => 'integer',
            'stock_quantity' => 'integer',
            'reserved_quantity' => 'integer',
            'low_stock_threshold' => 'integer',
            'position' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** @return HasMany<ProductImage, $this> */
    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class);
    }

    /** @return HasMany<StockMovement, $this> */
    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    /** @return HasMany<SaleItem, $this> */
    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    /** @return HasMany<ArrivalItem, $this> */
    public function arrivalItems(): HasMany
    {
        return $this->hasMany(ArrivalItem::class);
    }

    /**
     * Quantité réellement disponible à la vente.
     *
     * @return Attribute<int<0, max>, never>
     */
    protected function availableQuantity(): Attribute
    {
        return Attribute::get(fn (): int => max(0, $this->stock_quantity - $this->reserved_quantity));
    }

    /** @return Attribute<bool, never> */
    protected function isLowStock(): Attribute
    {
        return Attribute::get(fn (): bool => $this->stock_quantity <= $this->low_stock_threshold);
    }

    /**
     * Valeur du stock au prix de revient.
     *
     * @return Attribute<int, never>
     */
    protected function stockValue(): Attribute
    {
        return Attribute::get(fn (): int => $this->stock_quantity * $this->cost_price);
    }

    /** @return Attribute<int, never> */
    protected function marginAmount(): Attribute
    {
        return Attribute::get(fn (): int => $this->selling_price - $this->cost_price);
    }

    /**
     * Taux de marge en % du prix de vente.
     *
     * @return Attribute<float, never>
     */
    protected function marginRate(): Attribute
    {
        return Attribute::get(function (): float {
            if ($this->selling_price <= 0) {
                return 0.0;
            }

            return round((($this->selling_price - $this->cost_price) / $this->selling_price) * 100, 1);
        });
    }

    /**
     * Libellé court : « Cabine 55cm / Noir ».
     *
     * @return Attribute<non-falsy-string, never>
     */
    protected function variantLabel(): Attribute
    {
        return Attribute::get(function (): string {
            $parts = array_filter([$this->size, $this->color]);

            return $parts !== [] ? implode(' / ', $parts) : 'Standard';
        });
    }

    /** Libellé complet avec le nom du produit. */
    public function fullLabel(): string
    {
        $name = $this->relationLoaded('product') && $this->product
            ? $this->product->name
            : (string) $this->sku;

        $variant = $this->variant_label;

        return $variant === 'Standard' ? $name : "{$name} — {$variant}";
    }

    /** @param  Builder<self>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param  Builder<self>  $query */
    public function scopeLowStock(Builder $query): void
    {
        $query->whereColumn('stock_quantity', '<=', 'low_stock_threshold');
    }

    /** @param  Builder<self>  $query */
    public function scopeInStock(Builder $query): void
    {
        $query->where('stock_quantity', '>', 0);
    }

    /** @param  Builder<self>  $query */
    public function scopeSearch(Builder $query, ?string $term): void
    {
        if (blank($term)) {
            return;
        }

        $query->where(function (Builder $q) use ($term) {
            $q->where('sku', 'like', "%{$term}%")
                ->orWhere('barcode', 'like', "%{$term}%")
                ->orWhere('color', 'like', "%{$term}%")
                ->orWhere('size', 'like', "%{$term}%")
                ->orWhereHas('product', fn (Builder $p) => $p->where('name', 'like', "%{$term}%")
                    ->orWhere('reference', 'like', "%{$term}%"));
        });
    }
}
