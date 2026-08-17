<?php

namespace Tests\Feature;

use App\Enums\CashCategory;
use App\Enums\CashSessionStatus;
use App\Enums\PaymentMethod;
use App\Enums\UserRole;
use App\Models\CashSession;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\CashSessionService;
use App\Services\SaleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class CashSessionTest extends TestCase
{
    use RefreshDatabase;

    protected function vendeur(): User
    {
        return User::factory()->create(['role' => UserRole::Vendeur->value]);
    }

    protected function cash(): CashSessionService
    {
        return app(CashSessionService::class);
    }

    public function test_opening_the_till_records_the_float(): void
    {
        $this->actingAs($this->vendeur());

        $session = $this->cash()->open(20000, 'Fond du matin');

        $this->assertSame(20000, $session->opening_float);
        $this->assertSame(CashSessionStatus::Ouverte, $session->status);
        $this->assertSame(20000, $session->expectedCash());
        $this->assertNotNull(CashSession::current());
    }

    public function test_two_tills_cannot_be_open_at_once(): void
    {
        $this->actingAs($this->vendeur());
        $this->cash()->open(10000);

        $this->expectException(RuntimeException::class);
        $this->cash()->open(5000);
    }

    /**
     * Une vente en especes garnit le tiroir, une vente par Wave non : c'est
     * toute la raison d'etre du theorique.
     */
    public function test_only_cash_sales_reach_the_drawer(): void
    {
        $this->actingAs($this->vendeur());
        $session = $this->cash()->open(10000);

        $variant = ProductVariant::factory()->withStock(10)->create(['selling_price' => 30000]);
        $sales = app(SaleService::class);

        $sales->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1]],
            ['payment_method' => PaymentMethod::Especes->value, 'amount_paid' => 50000],
        );
        $sales->create(
            [['product_variant_id' => $variant->id, 'quantity' => 1]],
            ['payment_method' => PaymentMethod::Wave->value],
        );

        // 10 000 de fond + 30 000 encaisses en especes. Les 20 000 rendus en
        // monnaie ne sont jamais entres dans le tiroir, et Wave non plus.
        $this->assertSame(30000, $session->fresh()->cashFromSales());
        $this->assertSame(40000, $session->fresh()->expectedCash());
    }

    public function test_a_purchase_paid_by_wave_does_not_empty_the_drawer(): void
    {
        $this->actingAs($this->vendeur());
        $session = $this->cash()->open(50000);

        $this->cash()->record([
            'category' => CashCategory::AchatMarchandise->value,
            'label' => 'Carton de housses',
            'amount' => 15000,
            'payment_method' => PaymentMethod::Especes->value,
        ]);
        $this->cash()->record([
            'category' => CashCategory::Fourniture->value,
            'label' => 'Rouleau d’étiquettes',
            'amount' => 8000,
            'payment_method' => PaymentMethod::Wave->value,
        ]);

        $this->assertSame(35000, $session->fresh()->expectedCash());
    }

    public function test_an_incoming_movement_raises_the_drawer(): void
    {
        $this->actingAs($this->vendeur());
        $session = $this->cash()->open(10000);

        $this->cash()->record([
            'category' => CashCategory::Apport->value,
            'label' => 'Appoint du gérant',
            'amount' => 25000,
        ]);

        $this->assertSame(35000, $session->fresh()->expectedCash());
    }

    /** La categorie impose le sens : un loyer ne peut pas entrer en caisse. */
    public function test_the_category_decides_the_direction(): void
    {
        $this->actingAs($this->vendeur());
        $this->cash()->open(0);

        $movement = $this->cash()->record([
            'category' => CashCategory::Loyer->value,
            'label' => 'Loyer août',
            'amount' => 200000,
        ]);

        $this->assertSame('sortie', $movement->direction->value);
    }

    public function test_closing_freezes_the_expected_amount_and_the_gap(): void
    {
        $this->actingAs($this->vendeur());
        $session = $this->cash()->open(10000);

        $this->cash()->record([
            'category' => CashCategory::Transport->value,
            'label' => 'Taxi livraison',
            'amount' => 2000,
        ]);

        $closed = $this->cash()->close($session, 7500, 'Il manque une pièce');

        $this->assertSame(8000, $closed->expected_cash);
        $this->assertSame(7500, $closed->counted_cash);
        $this->assertSame(-500, $closed->variance);
        $this->assertSame(CashSessionStatus::Fermee, $closed->status);
        $this->assertNull(CashSession::current());
    }

    public function test_a_closed_till_cannot_be_closed_again(): void
    {
        $this->actingAs($this->vendeur());
        $session = $this->cash()->open(10000);
        $this->cash()->close($session, 10000);

        $this->expectException(RuntimeException::class);
        $this->cash()->close($session->fresh(), 9000);
    }

    /**
     * Le theorique fige a la fermeture ne bouge plus. C'est ce qui fait d'une
     * fermeture un constat plutot qu'un calcul refait chaque fois qu'on
     * regarde.
     */
    public function test_the_frozen_amount_survives_a_later_movement(): void
    {
        $this->actingAs($this->vendeur());
        $session = $this->cash()->open(10000);
        $closed = $this->cash()->close($session, 10000);

        $this->cash()->record([
            'category' => CashCategory::Divers->value,
            'label' => 'Saisie oubliée',
            'amount' => 3000,
        ]);

        $this->assertSame(10000, $closed->fresh()->expected_cash);
        $this->assertSame(0, $closed->fresh()->variance);
    }

    public function test_a_purchase_is_recorded_even_without_an_open_till(): void
    {
        $this->actingAs($this->vendeur());

        $movement = $this->cash()->record([
            'category' => CashCategory::AchatMarchandise->value,
            'label' => 'Achat un dimanche',
            'amount' => 5000,
        ]);

        $this->assertNull($movement->cash_session_id);
        $this->assertDatabaseCount('cash_movements', 1);
    }

    public function test_the_seller_opens_and_closes_the_till_from_the_screen(): void
    {
        $vendeur = $this->vendeur();

        $this->actingAs($vendeur)
            ->post('/caisse/ouvrir', ['opening_float' => 15000])
            ->assertRedirect();

        $session = CashSession::current();
        $this->assertNotNull($session);

        $this->actingAs($vendeur)
            ->post("/caisse/{$session->id}/fermer", ['counted_cash' => 15000])
            ->assertRedirect();

        $this->assertSame(CashSessionStatus::Fermee, $session->fresh()->status);

        $this->actingAs($vendeur)
            ->get("/caisse/{$session->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('caisse/show')
                ->where('session.countedCash', 15000)
                ->where('session.variance', 0));
    }

    /** Supprimer un mouvement deplace l'ecart d'une caisse : geste de gerant. */
    public function test_a_seller_cannot_delete_a_movement(): void
    {
        $this->actingAs($vendeur = $this->vendeur());
        $movement = $this->cash()->record([
            'category' => CashCategory::Divers->value,
            'label' => 'Divers',
            'amount' => 1000,
        ]);

        $this->actingAs($vendeur)
            ->delete("/achats/{$movement->id}")
            ->assertForbidden();

        $this->assertDatabaseCount('cash_movements', 1);
    }
}
