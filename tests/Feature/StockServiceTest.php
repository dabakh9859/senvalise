<?php

namespace Tests\Feature;

use App\Enums\MovementReason;
use App\Enums\MovementType;
use App\Models\ProductVariant;
use App\Models\Setting;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class StockServiceTest extends TestCase
{
    use RefreshDatabase;

    protected StockService $stock;

    protected function setUp(): void
    {
        parent::setUp();

        $this->stock = app(StockService::class);
    }

    public function test_an_entry_raises_the_stock_and_journals_the_movement(): void
    {
        $variant = ProductVariant::factory()->withStock(5)->create();

        $movement = $this->stock->move($variant, 3, MovementReason::RetourClient);

        $this->assertSame(8, $variant->fresh()->stock_quantity);
        $this->assertSame(5, $movement->quantity_before);
        $this->assertSame(8, $movement->quantity_after);
        $this->assertSame(MovementType::Entree, $movement->type);
    }

    public function test_an_exit_lowers_the_stock(): void
    {
        $variant = ProductVariant::factory()->withStock(5)->create();

        $movement = $this->stock->move($variant, -2, MovementReason::Casse);

        $this->assertSame(3, $variant->fresh()->stock_quantity);
        $this->assertSame(MovementType::Sortie, $movement->type);
    }

    public function test_stock_cannot_go_negative_by_default(): void
    {
        $variant = ProductVariant::factory()->withStock(2)->create();

        $this->expectException(RuntimeException::class);

        $this->stock->move($variant, -5, MovementReason::Vente);
    }

    public function test_negative_stock_is_allowed_when_the_shop_enables_it(): void
    {
        Setting::put('allow_negative_stock', true);

        $variant = ProductVariant::factory()->withStock(2)->create();

        $this->stock->move($variant, -5, MovementReason::Vente);

        $this->assertSame(-3, $variant->fresh()->stock_quantity);
    }

    /**
     * 10 pièces à 20 000 puis 10 à 30 000 doivent donner un prix de revient
     * moyen de 25 000 — c'est ce chiffre qui sert au calcul des marges.
     */
    public function test_the_average_cost_is_weighted_by_quantity(): void
    {
        $variant = ProductVariant::factory()->withStock(10, 20000)->create();

        $this->stock->move($variant, 10, MovementReason::Arrivage, unitCost: 30000);

        $this->assertSame(25000, $variant->fresh()->cost_price);
    }

    public function test_an_empty_stock_simply_takes_the_new_cost(): void
    {
        $variant = ProductVariant::factory()->withStock(0, 99000)->create();

        $this->stock->move($variant, 5, MovementReason::Arrivage, unitCost: 12000);

        $this->assertSame(12000, $variant->fresh()->cost_price);
    }

    public function test_the_average_cost_is_untouched_on_an_exit(): void
    {
        $variant = ProductVariant::factory()->withStock(10, 20000)->create();

        $this->stock->move($variant, -4, MovementReason::Vente);

        $this->assertSame(20000, $variant->fresh()->cost_price);
    }

    public function test_a_stock_count_only_records_a_movement_when_there_is_a_gap(): void
    {
        $variant = ProductVariant::factory()->withStock(7)->create();

        $this->assertNull($this->stock->setQuantity($variant, 7));

        $movement = $this->stock->setQuantity($variant, 4);

        $this->assertNotNull($movement);
        $this->assertSame(-3, $movement->quantity);
        $this->assertSame(MovementType::Ajustement, $movement->type);
        $this->assertSame(4, $variant->fresh()->stock_quantity);
    }

    public function test_a_zero_quantity_movement_is_rejected(): void
    {
        $variant = ProductVariant::factory()->withStock(5)->create();

        $this->expectException(RuntimeException::class);

        $this->stock->move($variant, 0, MovementReason::Correction);
    }

    public function test_the_stock_value_uses_the_average_cost(): void
    {
        ProductVariant::factory()->withStock(4, 10000)->create();
        ProductVariant::factory()->withStock(2, 25000)->create();

        $this->assertSame(90000, $this->stock->totalStockValue());
    }
}
