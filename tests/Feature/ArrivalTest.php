<?php

namespace Tests\Feature;

use App\Enums\ArrivalStatus;
use App\Models\ProductVariant;
use App\Services\ArrivalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class ArrivalTest extends TestCase
{
    use RefreshDatabase;

    protected ArrivalService $arrivals;

    protected function setUp(): void
    {
        parent::setUp();

        $this->arrivals = app(ArrivalService::class);
    }

    /**
     * Deux lignes de même valeur totale doivent se partager les frais à parts
     * égales : 100 000 de fret sur 2 × 500 000 → +25 000 par pièce sur la
     * ligne de 10, +50 000 sur celle de 5.
     */
    public function test_extra_costs_are_spread_across_lines_by_value(): void
    {
        $a = ProductVariant::factory()->create();
        $b = ProductVariant::factory()->create();

        $arrival = $this->arrivals->create([
            'arrival_date' => now()->toDateString(),
            'currency' => 'XOF',
            'exchange_rate' => 1,
            'shipping_cost' => 100000,
        ], [
            ['product_variant_id' => $a->id, 'quantity' => 10, 'unit_cost' => 50000],
            ['product_variant_id' => $b->id, 'quantity' => 5, 'unit_cost' => 100000],
        ]);

        $items = $arrival->fresh('items')->items->keyBy('product_variant_id');

        $this->assertSame(1000000, $arrival->goods_cost);
        $this->assertSame(1100000, $arrival->total_cost);
        $this->assertSame(55000, $items[$a->id]->landed_unit_cost);
        $this->assertSame(110000, $items[$b->id]->landed_unit_cost);
    }

    public function test_purchase_prices_are_converted_with_the_exchange_rate(): void
    {
        $variant = ProductVariant::factory()->create();

        $arrival = $this->arrivals->create([
            'arrival_date' => now()->toDateString(),
            'currency' => 'EUR',
            'exchange_rate' => 655.957,
        ], [
            ['product_variant_id' => $variant->id, 'quantity' => 2, 'unit_cost' => 100],
        ]);

        $item = $arrival->fresh('items')->items->first();

        $this->assertSame(65596, $item->unit_cost_xof);
        $this->assertSame(131192, $item->line_total);
    }

    /** Marchandise offerte : les frais se répartissent alors à la quantité. */
    public function test_free_goods_spread_the_costs_per_unit(): void
    {
        $a = ProductVariant::factory()->create();
        $b = ProductVariant::factory()->create();

        $arrival = $this->arrivals->create([
            'arrival_date' => now()->toDateString(),
            'currency' => 'XOF',
            'exchange_rate' => 1,
            'shipping_cost' => 30000,
        ], [
            ['product_variant_id' => $a->id, 'quantity' => 2, 'unit_cost' => 0],
            ['product_variant_id' => $b->id, 'quantity' => 1, 'unit_cost' => 0],
        ]);

        $items = $arrival->fresh('items')->items->keyBy('product_variant_id');

        $this->assertSame(10000, $items[$a->id]->landed_unit_cost);
        $this->assertSame(10000, $items[$b->id]->landed_unit_cost);
    }

    public function test_receiving_moves_the_goods_into_stock_at_their_landed_cost(): void
    {
        $variant = ProductVariant::factory()->withStock(0)->create();

        $arrival = $this->arrivals->create([
            'arrival_date' => now()->toDateString(),
            'currency' => 'XOF',
            'exchange_rate' => 1,
            'customs_cost' => 20000,
        ], [
            ['product_variant_id' => $variant->id, 'quantity' => 10, 'unit_cost' => 30000],
        ]);

        $this->assertSame(0, $variant->fresh()->stock_quantity);

        $this->arrivals->receive($arrival);

        $variant->refresh();

        $this->assertSame(10, $variant->stock_quantity);
        $this->assertSame(32000, $variant->cost_price);
        $this->assertSame(ArrivalStatus::Receptionne, $arrival->fresh()->status);
        $this->assertDatabaseCount('stock_movements', 1);
    }

    public function test_an_arrival_cannot_be_received_twice(): void
    {
        $variant = ProductVariant::factory()->create();

        $arrival = $this->arrivals->create([
            'arrival_date' => now()->toDateString(),
            'currency' => 'XOF',
            'exchange_rate' => 1,
        ], [
            ['product_variant_id' => $variant->id, 'quantity' => 3, 'unit_cost' => 10000],
        ]);

        $this->arrivals->receive($arrival);

        $this->expectException(RuntimeException::class);

        $this->arrivals->receive($arrival->fresh());
    }

    public function test_an_empty_arrival_cannot_be_received(): void
    {
        $arrival = $this->arrivals->create([
            'arrival_date' => now()->toDateString(),
            'currency' => 'XOF',
            'exchange_rate' => 1,
        ], []);

        $this->expectException(RuntimeException::class);

        $this->arrivals->receive($arrival);
    }

    public function test_a_received_arrival_can_no_longer_be_edited(): void
    {
        $variant = ProductVariant::factory()->create();

        $arrival = $this->arrivals->create([
            'arrival_date' => now()->toDateString(),
            'currency' => 'XOF',
            'exchange_rate' => 1,
        ], [
            ['product_variant_id' => $variant->id, 'quantity' => 1, 'unit_cost' => 5000],
        ]);

        $this->arrivals->receive($arrival);

        $this->expectException(RuntimeException::class);

        $this->arrivals->syncItems($arrival->fresh(), []);
    }

    public function test_the_summary_projects_the_margin_at_shop_prices(): void
    {
        $variant = ProductVariant::factory()->create(['selling_price' => 50000]);

        $arrival = $this->arrivals->create([
            'arrival_date' => now()->toDateString(),
            'currency' => 'XOF',
            'exchange_rate' => 1,
        ], [
            ['product_variant_id' => $variant->id, 'quantity' => 4, 'unit_cost' => 30000],
        ]);

        $summary = $this->arrivals->summary($arrival->fresh('items'));

        $this->assertSame(200000, $summary['expected_revenue']);
        $this->assertSame(120000, $summary['landed_total']);
        $this->assertSame(80000, $summary['expected_margin']);
        $this->assertSame(40.0, $summary['expected_margin_rate']);
    }
}
