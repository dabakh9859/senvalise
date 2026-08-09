<?php

namespace App\Models;

use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Un produit est un modèle (ex: « Valise Delsey Chatelet »). Ce qui se vend
 * réellement, ce sont ses variantes (taille / couleur), qui portent le stock
 * et le code-barres.
 *
 * @property int $id
 * @property string $reference
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property int|null $category_id
 * @property int|null $brand_id
 * @property string|null $material
 * @property int|null $warranty_months
 * @property bool $is_active
 * @property bool $is_published
 * @property Carbon|null $published_at
 * @property string|null $web_description
 * @property string|null $meta_title
 * @property string|null $meta_description
 * @property int|null $created_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Category|null $category
 * @property-read Brand|null $brand
 * @property-read User|null $creator
 * @property-read Collection<int, ProductVariant> $variants
 * @property-read Collection<int, ProductImage> $images
 */
#[Fillable([
    'reference', 'name', 'slug', 'description', 'category_id', 'brand_id',
    'material', 'warranty_months', 'is_active',
    'is_published', 'published_at', 'web_description', 'meta_title', 'meta_description',
    'created_by',
])]
class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use HasFactory, SoftDeletes;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_published' => 'boolean',
            'published_at' => 'datetime',
            'warranty_months' => 'integer',
        ];
    }

    /** @return BelongsTo<Category, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /** @return BelongsTo<Brand, $this> */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return HasMany<ProductVariant, $this> */
    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('position')->orderBy('id');
    }

    /** @return HasMany<ProductImage, $this> */
    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderByDesc('is_primary')->orderBy('position');
    }

    /** @param  Builder<self>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param  Builder<self>  $query */
    public function scopePublished(Builder $query): void
    {
        $query->where('is_active', true)->where('is_published', true);
    }

    /** @param  Builder<self>  $query */
    public function scopeSearch(Builder $query, ?string $term): void
    {
        if (blank($term)) {
            return;
        }

        $query->where(function (Builder $q) use ($term) {
            $q->where('name', 'like', "%{$term}%")
                ->orWhere('reference', 'like', "%{$term}%")
                ->orWhereHas('variants', function (Builder $v) use ($term) {
                    $v->where('sku', 'like', "%{$term}%")
                        ->orWhere('barcode', 'like', "%{$term}%");
                });
        });
    }

    /** Stock cumulé de toutes les variantes. */
    public function totalStock(): int
    {
        return (int) $this->variants->sum('stock_quantity');
    }

    /** Génère la prochaine référence interne : SV-0001, SV-0002... */
    public static function nextReference(): string
    {
        $last = static::withTrashed()
            ->where('reference', 'like', 'SV-%')
            ->orderByDesc('id')
            ->value('reference');

        $number = is_string($last) ? ((int) Str::afterLast($last, '-')) + 1 : 1;

        return 'SV-'.str_pad((string) $number, 4, '0', STR_PAD_LEFT);
    }

    protected static function booted(): void
    {
        static::saving(function (self $product) {
            if (blank($product->slug)) {
                $product->slug = static::uniqueSlug($product->name, $product->id);
            }
        });
    }

    protected static function uniqueSlug(string $name, ?int $ignoreId = null): string
    {
        $base = Str::slug($name) ?: 'produit';
        $slug = $base;
        $i = 2;

        while (static::withTrashed()
            ->where('slug', $slug)
            ->when($ignoreId, fn (Builder $q) => $q->whereKeyNot($ignoreId))
            ->exists()
        ) {
            $slug = "{$base}-{$i}";
            $i++;
        }

        return $slug;
    }
}
