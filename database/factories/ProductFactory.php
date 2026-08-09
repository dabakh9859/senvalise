<?php

namespace Database\Factories;

use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    protected $model = Product::class;

    public function definition(): array
    {
        return [
            // Un lot de produits est préparé avant d'être enregistré :
            // nextReference() rendrait la même valeur pour tous. On tire donc
            // un numéro unique sans interroger la base.
            'reference' => 'SV-'.str_pad(
                (string) fake()->unique()->numberBetween(1, 999999),
                6,
                '0',
                STR_PAD_LEFT,
            ),
            'name' => 'Valise '.fake()->unique()->word(),
            'material' => fake()->randomElement(['ABS', 'Polycarbonate', 'Polyester']),
            'is_active' => true,
            'is_published' => false,
        ];
    }

    public function published(): static
    {
        return $this->state(fn () => [
            'is_published' => true,
            'published_at' => now(),
        ]);
    }
}
