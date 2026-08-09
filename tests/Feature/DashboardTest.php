<?php

namespace Tests\Feature;

use App\Enums\DocumentStatus;
use App\Enums\DocumentType;
use App\Enums\UserRole;
use App\Models\Customer;
use App\Models\Document;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\User;
use App\Services\SaleService;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function gerant(): User
    {
        return User::factory()->create(['role' => UserRole::Gerant->value]);
    }

    protected function vendeur(): User
    {
        return User::factory()->create(['role' => UserRole::Vendeur->value]);
    }

    public function test_guests_are_redirected_to_the_login_page(): void
    {
        $this->get(route('dashboard'))->assertRedirect(route('login'));
    }

    public function test_authenticated_users_can_visit_the_dashboard(): void
    {
        $this->actingAs($this->vendeur())
            ->get(route('dashboard'))
            ->assertOk();
    }

    /** Le chiffre en tête de page est le total encaissé sur la période choisie. */
    public function test_the_headline_figure_covers_the_selected_period(): void
    {
        $variant = ProductVariant::factory()->withStock(20, 10000)->create([
            'selling_price' => 25000,
        ]);

        $sales = app(SaleService::class);
        $recent = $sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 2],
        ]);
        $old = $sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 3],
        ]);

        $old->update(['sold_at' => now()->subDays(20)]);

        $this->actingAs($this->gerant())
            ->get('/dashboard?periode=7j')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('period.preset', '7j')
                ->where('hero.revenue', $recent->total)
                ->where('hero.salesCount', 1));

        $this->actingAs($this->gerant())
            ->get('/dashboard?periode=30j')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('hero.revenue', $recent->total + $old->total)
                ->where('hero.salesCount', 2));
    }

    /** Une période inconnue retombe sur 30 jours plutôt que de casser la page. */
    public function test_an_unknown_period_falls_back_to_thirty_days(): void
    {
        $this->actingAs($this->vendeur())
            ->get('/dashboard?periode=nimportequoi')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('period.preset', '30j'));
    }

    /**
     * Le vendeur ne doit jamais recevoir la marge : elle n'est pas seulement
     * masquée à l'écran, elle n'est pas sérialisée.
     */
    public function test_a_seller_never_receives_margin_data(): void
    {
        $variant = ProductVariant::factory()->withStock(10, 10000)->create([
            'selling_price' => 25000,
        ]);

        app(SaleService::class)->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);

        $this->actingAs($this->vendeur())
            ->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('daily.showMargin', false)
                ->where('daily.points.0.margin', null));
    }

    public function test_the_manager_receives_margin_data(): void
    {
        $variant = ProductVariant::factory()->withStock(10, 10000)->create([
            'selling_price' => 25000,
        ]);

        app(SaleService::class)->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);

        $this->actingAs($this->gerant())
            ->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('daily.showMargin', true)
                ->where('kpis.4.key', 'margin'));
    }

    /**
     * Une créance vieille de six mois reste due aujourd'hui : elle doit
     * apparaître même en affichage « 7 jours ».
     */
    public function test_old_receivables_show_up_whatever_the_period(): void
    {
        Document::create([
            'type' => DocumentType::Facture,
            'reference' => 'FA-2026-0001',
            'customer_id' => Customer::create(['name' => 'Fatou Ndiaye'])->id,
            'issue_date' => now()->subDays(200),
            'due_date' => now()->subDays(190),
            'status' => DocumentStatus::Envoye,
            'subtotal' => 80000,
            'total' => 80000,
            'amount_paid' => 30000,
        ]);

        $this->actingAs($this->gerant())
            ->get('/dashboard?periode=7j')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('ageing.total', 50000)
                ->where('ageing.buckets.3.key', '90+')
                ->where('ageing.buckets.3.amount', 50000)
                ->where('ageing.buckets.3.count', 1));
    }

    /** Une facture annulée n'est ni une créance ni un encaissement en attente. */
    public function test_a_cancelled_invoice_is_left_out(): void
    {
        Document::create([
            'type' => DocumentType::Facture,
            'reference' => 'FA-2026-0002',
            'issue_date' => now(),
            'status' => DocumentStatus::Annule,
            'subtotal' => 45000,
            'total' => 45000,
            'amount_paid' => 0,
        ]);

        $this->actingAs($this->gerant())
            ->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('ageing.total', 0)
                ->where('collection.2.count', 0));
    }

    /** Une vente à crédit augmente le chiffre d'affaires sans passer en caisse. */
    public function test_credit_sales_split_revenue_from_cash_collected(): void
    {
        $variant = ProductVariant::factory()->withStock(10, 10000)->create([
            'selling_price' => 25000,
        ]);

        $sale = app(SaleService::class)->create([
            ['product_variant_id' => $variant->id, 'quantity' => 2],
        ]);

        $sale->update(['amount_paid' => 20000, 'change_due' => 0]);

        $this->actingAs($this->gerant())
            ->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('hero.revenue', 50000)
                ->where('kpis.0.key', 'collected')
                ->where('kpis.1.key', 'outstanding')
                ->where('kpis.1.value', Money::format(30000)));
    }

    /** Les classements ne comptent que les ventes valides. */
    public function test_cancelled_sales_are_excluded_from_the_rankings(): void
    {
        $variant = ProductVariant::factory()->withStock(10, 10000)->create([
            'selling_price' => 25000,
        ]);

        $sales = app(SaleService::class);
        $kept = $sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 1],
        ]);
        $cancelled = $sales->create([
            ['product_variant_id' => $variant->id, 'quantity' => 4],
        ]);

        $sales->cancel($cancelled);

        $this->actingAs($this->gerant())
            ->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('hero.revenue', $kept->total)
                ->where('topProducts.0.value', $kept->total)
                ->count('topProducts', 1));

        $this->assertSame(1, Sale::valid()->count());
    }

    /** Au-delà de quatre mois la courbe passe au pas mensuel : 365 points seraient illisibles. */
    public function test_the_yearly_view_switches_to_monthly_points(): void
    {
        $this->actingAs($this->gerant())
            ->get('/dashboard?periode=12m')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->count('daily.points', 13)
                ->where('daily.points.0.date', now()->subDays(364)->format('Y-m')));
    }
}
