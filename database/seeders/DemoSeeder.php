<?php

namespace Database\Seeders;

use App\Enums\PaymentMethod;
use App\Enums\UserRole;
use App\Models\Arrival;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\User;
use App\Services\ArrivalService;
use App\Services\ProductService;
use App\Services\SaleService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Auth;

/**
 * Jeu de données de démonstration : catalogue de valises, un arrivage
 * réceptionné et quelques ventes, pour que l'application soit utilisable
 * immédiatement sans saisie manuelle.
 *
 *   php artisan db:seed --class=DemoSeeder
 */
class DemoSeeder extends Seeder
{
    public function __construct(
        private readonly ProductService $products,
        private readonly ArrivalService $arrivals,
        private readonly SaleService $sales,
    ) {}

    public function run(): void
    {
        $gerant = User::where('role', UserRole::Gerant->value)->firstOrFail();
        Auth::login($gerant);

        $categories = $this->categories();
        $brands = $this->brands();
        $supplier = $this->supplier();
        $this->customers();

        $created = $this->catalogue($categories, $brands);

        $this->arrival($supplier, $created);
        $this->someSales();

        Auth::logout();
    }

    /** @return array<string, Category> */
    protected function categories(): array
    {
        $names = [
            'Valises rigides',
            'Valises souples',
            'Sets de valises',
            'Bagages cabine',
            'Sacs de voyage',
            'Sacs à dos',
            'Accessoires',
        ];

        $out = [];

        foreach ($names as $position => $name) {
            $out[$name] = Category::firstOrCreate(
                ['slug' => str($name)->slug()->value()],
                ['name' => $name, 'position' => $position],
            );
        }

        return $out;
    }

    /** @return array<string, Brand> */
    protected function brands(): array
    {
        $out = [];

        foreach (['Samsonite', 'Delsey', 'American Tourister', 'Eminent', 'Swissgear', 'Sans marque'] as $name) {
            $out[$name] = Brand::firstOrCreate(
                ['slug' => str($name)->slug()->value()],
                ['name' => $name],
            );
        }

        return $out;
    }

    protected function supplier(): Supplier
    {
        return Supplier::firstOrCreate(
            ['name' => 'Guangzhou Luggage Trading'],
            [
                'contact_name' => 'Mme Chen',
                'phone' => '+86 138 0000 0000',
                'email' => 'contact@gz-luggage.example',
                'city' => 'Guangzhou',
                'country' => 'Chine',
                'notes' => 'Fournisseur principal — conteneur tous les 3 mois.',
            ],
        );
    }

    protected function customers(): void
    {
        $rows = [
            ['name' => 'Fatou Ndiaye', 'phone' => '77 123 45 67', 'city' => 'Dakar'],
            ['name' => 'Moussa Diop', 'phone' => '76 987 65 43', 'city' => 'Thiès'],
            ['name' => 'Aïssatou Sarr', 'phone' => '70 555 22 11', 'city' => 'Dakar'],
            [
                'name' => 'Ibrahima Fall',
                'type' => 'entreprise',
                'company_name' => 'Sénégal Voyages SARL',
                'phone' => '33 821 00 00',
                'city' => 'Dakar',
                'address' => 'Avenue Léopold Sédar Senghor',
            ],
        ];

        foreach ($rows as $row) {
            Customer::firstOrCreate(['phone' => $row['phone']], $row);
        }
    }

    /**
     * @param  array<string, Category>  $categories
     * @param  array<string, Brand>  $brands
     * @return array<int, ProductVariant>
     */
    protected function catalogue(array $categories, array $brands): array
    {
        $blueprint = [
            [
                'name' => 'Valise rigide 4 roues ABS',
                'category' => 'Valises rigides',
                'brand' => 'Eminent',
                'material' => 'ABS',
                'warranty_months' => 12,
                'variants' => [
                    ['size' => 'Cabine 55cm', 'color' => 'Noir', 'cost_price' => 24000, 'selling_price' => 42000, 'dimensions' => '55 x 38 x 22 cm', 'capacity_l' => 38, 'weight_kg' => 2.9],
                    ['size' => 'Cabine 55cm', 'color' => 'Bleu marine', 'cost_price' => 24000, 'selling_price' => 42000, 'dimensions' => '55 x 38 x 22 cm', 'capacity_l' => 38, 'weight_kg' => 2.9],
                    ['size' => 'Moyenne 65cm', 'color' => 'Noir', 'cost_price' => 33000, 'selling_price' => 58000, 'dimensions' => '65 x 45 x 26 cm', 'capacity_l' => 62, 'weight_kg' => 3.7],
                    ['size' => 'Grande 75cm', 'color' => 'Noir', 'cost_price' => 42000, 'selling_price' => 75000, 'dimensions' => '75 x 50 x 30 cm', 'capacity_l' => 95, 'weight_kg' => 4.5],
                ],
            ],
            [
                'name' => 'Valise polycarbonate premium',
                'category' => 'Valises rigides',
                'brand' => 'Delsey',
                'material' => 'Polycarbonate',
                'warranty_months' => 24,
                'variants' => [
                    ['size' => 'Cabine 55cm', 'color' => 'Argent', 'cost_price' => 48000, 'selling_price' => 89000, 'dimensions' => '55 x 40 x 20 cm', 'capacity_l' => 40, 'weight_kg' => 2.6],
                    ['size' => 'Moyenne 68cm', 'color' => 'Argent', 'cost_price' => 62000, 'selling_price' => 115000, 'dimensions' => '68 x 45 x 28 cm', 'capacity_l' => 70, 'weight_kg' => 3.4],
                    ['size' => 'Moyenne 68cm', 'color' => 'Rouge', 'cost_price' => 62000, 'selling_price' => 115000, 'dimensions' => '68 x 45 x 28 cm', 'capacity_l' => 70, 'weight_kg' => 3.4],
                ],
            ],
            [
                'name' => 'Set 3 valises assorties',
                'category' => 'Sets de valises',
                'brand' => 'Eminent',
                'material' => 'ABS',
                'warranty_months' => 12,
                'variants' => [
                    ['size' => 'Set 3 pièces', 'color' => 'Noir', 'cost_price' => 78000, 'selling_price' => 135000, 'low_stock_threshold' => 2],
                    ['size' => 'Set 3 pièces', 'color' => 'Bordeaux', 'cost_price' => 78000, 'selling_price' => 135000, 'low_stock_threshold' => 2],
                ],
            ],
            [
                'name' => 'Valise souple extensible',
                'category' => 'Valises souples',
                'brand' => 'American Tourister',
                'material' => 'Polyester 600D',
                'warranty_months' => 12,
                'variants' => [
                    ['size' => 'Moyenne 66cm', 'color' => 'Gris', 'cost_price' => 29000, 'selling_price' => 52000, 'capacity_l' => 65, 'weight_kg' => 3.1],
                    ['size' => 'Grande 76cm', 'color' => 'Gris', 'cost_price' => 36000, 'selling_price' => 66000, 'capacity_l' => 96, 'weight_kg' => 3.8],
                ],
            ],
            [
                'name' => 'Sac de voyage à roulettes',
                'category' => 'Sacs de voyage',
                'brand' => 'Swissgear',
                'material' => 'Nylon renforcé',
                'variants' => [
                    ['size' => '70 L', 'color' => 'Noir', 'cost_price' => 18000, 'selling_price' => 34000],
                    ['size' => '90 L', 'color' => 'Noir', 'cost_price' => 22000, 'selling_price' => 42000],
                ],
            ],
            [
                'name' => 'Sac à dos ordinateur 15,6"',
                'category' => 'Sacs à dos',
                'brand' => 'Swissgear',
                'material' => 'Polyester imperméable',
                'variants' => [
                    ['size' => '25 L', 'color' => 'Noir', 'cost_price' => 11000, 'selling_price' => 22000],
                    ['size' => '25 L', 'color' => 'Gris', 'cost_price' => 11000, 'selling_price' => 22000],
                ],
            ],
            [
                'name' => 'Cadenas TSA à code',
                'category' => 'Accessoires',
                'brand' => 'Sans marque',
                'variants' => [
                    ['color' => 'Noir', 'cost_price' => 1200, 'selling_price' => 3500, 'low_stock_threshold' => 10],
                ],
            ],
            [
                'name' => 'Housse de protection valise',
                'category' => 'Accessoires',
                'brand' => 'Sans marque',
                'variants' => [
                    ['size' => 'Cabine', 'cost_price' => 1800, 'selling_price' => 5000, 'low_stock_threshold' => 5],
                    ['size' => 'Grande', 'cost_price' => 2200, 'selling_price' => 6000, 'low_stock_threshold' => 5],
                ],
            ],
            [
                'name' => 'Balance à bagage digitale',
                'category' => 'Accessoires',
                'brand' => 'Sans marque',
                'variants' => [
                    ['color' => 'Noir', 'cost_price' => 2500, 'selling_price' => 7000, 'low_stock_threshold' => 5],
                ],
            ],
        ];

        $variants = [];

        foreach ($blueprint as $row) {
            if (Product::where('name', $row['name'])->exists()) {
                continue;
            }

            $product = $this->products->create([
                'name' => $row['name'],
                'category_id' => $categories[$row['category']]->id,
                'brand_id' => $brands[$row['brand']]->id,
                'material' => $row['material'] ?? null,
                'warranty_months' => $row['warranty_months'] ?? null,
                'is_active' => true,
                'is_published' => true,
                'published_at' => now(),
            ], $row['variants']);

            $variants = [...$variants, ...$product->variants->all()];
        }

        return $variants;
    }

    /** @param  array<int, ProductVariant>  $variants */
    protected function arrival(Supplier $supplier, array $variants): void
    {
        if ($variants === [] || Arrival::query()->exists()) {
            return;
        }

        $lines = array_map(fn (ProductVariant $variant) => [
            'product_variant_id' => $variant->id,
            // On repart du prix de revient prévu, converti en yuans pour
            // illustrer la gestion de devise.
            'unit_cost' => round($variant->cost_price / 78, 2),
            'quantity' => match (true) {
                $variant->selling_price >= 100000 => 4,
                $variant->selling_price >= 50000 => 8,
                $variant->selling_price >= 20000 => 12,
                default => 40,
            },
        ], $variants);

        $arrival = $this->arrivals->create([
            'supplier_id' => $supplier->id,
            'arrival_date' => now()->subDays(20)->toDateString(),
            'currency' => 'CNY',
            'exchange_rate' => 78,
            'shipping_cost' => 850000,
            'customs_cost' => 620000,
            'other_cost' => 90000,
            'notes' => 'Conteneur groupé — 3 palettes.',
        ], $lines);

        $this->arrivals->receive($arrival);
    }

    protected function someSales(): void
    {
        if (Sale::query()->exists()) {
            return;
        }

        $vendeur = User::where('role', UserRole::Vendeur->value)->first();
        $customers = Customer::pluck('id')->all();
        $stocked = ProductVariant::inStock()->get();

        if ($stocked->isEmpty()) {
            return;
        }

        $methods = [
            PaymentMethod::Especes->value,
            PaymentMethod::Wave->value,
            PaymentMethod::OrangeMoney->value,
            PaymentMethod::Especes->value,
        ];

        // Une trentaine de ventes réparties sur les 45 derniers jours, pour que
        // le tableau de bord et les rapports aient de quoi afficher.
        for ($i = 0; $i < 30; $i++) {
            $lines = $stocked->random(random_int(1, 3))
                ->map(fn (ProductVariant $variant) => [
                    'product_variant_id' => $variant->id,
                    'quantity' => random_int(1, 2),
                ])
                ->all();

            $soldAt = now()->subDays(random_int(0, 45))->setTime(random_int(9, 19), random_int(0, 59));

            try {
                $this->sales->create($lines, [
                    'customer_id' => random_int(1, 3) === 1 ? ($customers ? $customers[array_rand($customers)] : null) : null,
                    'user_id' => $vendeur?->id,
                    'sold_at' => $soldAt,
                    'payment_method' => $methods[array_rand($methods)],
                ]);
            } catch (\RuntimeException) {
                // Stock épuisé sur cette variante : on passe à la vente suivante.
                continue;
            }
        }
    }
}
