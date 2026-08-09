<?php

namespace Database\Factories;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Support\Barcode;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<ProductVariant>
 */
class ProductVariantFactory extends Factory
{
    protected $model = ProductVariant::class;

    public function definition(): array
    {
        return [
            'product_id' => Product::factory(),
            'sku' => 'SKU-'.Str::upper(Str::random(8)),
            'size' => fake()->randomElement(['Cabine 55cm', 'Moyenne 65cm', 'Grande 75cm']),
            'color' => fake()->randomElement(['Noir', 'Bleu', 'Rouge']),
            'cost_price' => 20000,
            'selling_price' => 40000,
            'stock_quantity' => 0,
            'low_stock_threshold' => 3,
            'is_active' => true,
        ];
    }

    public function withStock(int $quantity, int $costPrice = 20000): static
    {
        return $this->state(fn () => [
            'stock_quantity' => $quantity,
            'cost_price' => $costPrice,
        ]);
    }

    /** Attribue un code-barres EAN-13 valide après création. */
    public function withBarcode(): static
    {
        return $this->afterCreating(function (ProductVariant $variant) {
            $variant->update(['barcode' => Barcode::forVariant($variant->id)]);
        });
    }
}
