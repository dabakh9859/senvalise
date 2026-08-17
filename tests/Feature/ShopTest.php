<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\SaleChannel;
use App\Enums\SaleStatus;
use App\Enums\UserRole;
use App\Enums\VaultStatus;
use App\Models\Customer;
use App\Models\DeliveryZone;
use App\Models\HomeBlock;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\User;
use App\Services\Shop\OrderService;
use App\Services\Shop\VaultService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * La boutique en ligne.
 *
 * Le fil rouge de ces tests : une commande n'est pas une vente. Elle réserve
 * la marchandise, elle ne la sort pas. Tant que ce partage tient, une commande
 * annulée ne fait disparaître ni stock ni chiffre d'affaires.
 */
class ShopTest extends TestCase
{
    use RefreshDatabase;

    protected function zone(int $fee = 2000): DeliveryZone
    {
        return DeliveryZone::create([
            'name' => 'Dakar', 'city' => 'Dakar',
            'fee' => $fee, 'delay_days' => 1, 'is_active' => true,
        ]);
    }

    protected function variant(int $stock = 10, int $price = 45000): ProductVariant
    {
        $variant = ProductVariant::factory()->withStock($stock, 20000)->create([
            'selling_price' => $price,
            'web_price' => $price,
        ]);

        $variant->product?->update(['is_published' => true, 'is_active' => true]);

        return $variant->fresh() ?? $variant;
    }

    protected function customer(array $attributes = []): Customer
    {
        return Customer::create([
            'type' => 'particulier',
            'name' => 'Fatou Ndiaye',
            'phone' => '77 885 83 74',
            'is_active' => true,
            ...$attributes,
        ]);
    }

    /** @param  array<string, mixed>  $overrides */
    protected function checkoutPayload(DeliveryZone $zone, array $overrides = []): array
    {
        return [
            'customer_name' => 'Fatou Ndiaye',
            'customer_phone' => '77 885 83 74',
            'delivery_address' => 'Sacré-Cœur 3, villa 128',
            'delivery_zone_id' => $zone->id,
            'payment_method' => PaymentMethod::Especes->value,
            ...$overrides,
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Vitrine
    |--------------------------------------------------------------------------
    */

    public function test_the_shop_is_open_to_anyone(): void
    {
        $this->get('/boutique')->assertOk();
        $this->get('/boutique/catalogue')->assertOk();
        $this->get('/boutique/contact')->assertOk();
    }

    /** Un produit non publié n'apparaît jamais en vitrine, même par son adresse. */
    public function test_an_unpublished_product_stays_out_of_the_shop(): void
    {
        $variant = $this->variant();
        $slug = $variant->product?->slug;

        $this->get("/boutique/produit/{$slug}")->assertOk();

        $variant->product?->update(['is_published' => false]);

        $this->get("/boutique/produit/{$slug}")->assertNotFound();
        $this->get('/boutique/catalogue')
            ->assertInertia(fn ($page) => $page->count('products.data', 0));
    }

    /*
    |--------------------------------------------------------------------------
    | Panier
    |--------------------------------------------------------------------------
    */

    public function test_the_cart_keeps_quantities_and_prices(): void
    {
        $variant = $this->variant(price: 45000);

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 2])
            ->assertRedirect();

        $this->get('/boutique/panier')
            ->assertInertia(fn ($page) => $page
                ->where('cart.count', 2)
                ->where('cart.subtotal', 90000));
    }

    /** Le panier prévient avant de payer, il ne retire rien en silence. */
    public function test_the_cart_flags_a_shortage_instead_of_hiding_it(): void
    {
        $variant = $this->variant(stock: 1);

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 3]);

        $this->get('/boutique/panier')
            ->assertInertia(fn ($page) => $page
                ->where('cart.lines.0.shortage', 2)
                ->where('cart.lines.0.available', 1));
    }

    /*
    |--------------------------------------------------------------------------
    | Commande
    |--------------------------------------------------------------------------
    */

    /** Commander sans compte doit marcher : c'est la majorité des visiteurs. */
    public function test_an_anonymous_visitor_can_order(): void
    {
        $zone = $this->zone(2000);
        $variant = $this->variant(price: 45000);

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone))
            ->assertRedirect();

        $order = Order::first();

        $this->assertNotNull($order);
        $this->assertNull($order->customer_id);
        $this->assertSame(47000, $order->total);
        $this->assertSame(2000, $order->delivery_fee);
        $this->assertSame(OrderStatus::EnAttente, $order->status);
    }

    /** La commande réserve la marchandise ; elle ne la sort pas du rayon. */
    public function test_placing_an_order_reserves_stock_without_moving_it(): void
    {
        $zone = $this->zone();
        $variant = $this->variant(stock: 5);

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 2]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone));

        $fresh = $variant->fresh();

        $this->assertSame(5, $fresh?->stock_quantity);
        $this->assertSame(2, $fresh->reserved_quantity);
        $this->assertSame(3, $fresh->available_quantity);
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertDatabaseCount('sales', 0);
    }

    /** Confirmer, c'est vendre : le stock sort et la vente rejoint la caisse. */
    public function test_confirming_an_order_creates_the_sale_and_moves_stock(): void
    {
        $zone = $this->zone();
        $variant = $this->variant(stock: 5);

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 2]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone));

        $order = Order::firstOrFail();
        app(OrderService::class)->confirm($order);

        $fresh = $variant->fresh();
        $sale = Sale::firstOrFail();

        $this->assertSame(3, $fresh?->stock_quantity);
        $this->assertSame(0, $fresh->reserved_quantity);
        $this->assertSame(SaleChannel::EnLigne, $sale->channel);
        $this->assertSame(40000, $sale->total_cost);
        $this->assertSame($sale->id, $order->fresh()?->sale_id);
    }

    /** Annuler avant confirmation lève la réserve, sans toucher au journal. */
    public function test_cancelling_before_confirmation_only_releases_the_reservation(): void
    {
        $zone = $this->zone();
        $variant = $this->variant(stock: 5);

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 2]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone));

        app(OrderService::class)->cancel(Order::firstOrFail(), 'Test');

        $fresh = $variant->fresh();

        $this->assertSame(5, $fresh?->stock_quantity);
        $this->assertSame(0, $fresh->reserved_quantity);
        $this->assertDatabaseCount('stock_movements', 0);
    }

    /** Annuler après confirmation remet la marchandise et annule la vente. */
    public function test_cancelling_after_confirmation_puts_the_goods_back(): void
    {
        $zone = $this->zone();
        $variant = $this->variant(stock: 5);

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 2]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone));

        $orders = app(OrderService::class);
        $order = $orders->confirm(Order::firstOrFail());
        $orders->cancel($order->fresh() ?? $order, 'Client injoignable');

        $this->assertSame(5, $variant->fresh()?->stock_quantity);
        $this->assertSame(SaleStatus::Annulee, Sale::firstOrFail()->status);
        $this->assertSame(OrderStatus::Annulee, Order::firstOrFail()->status);
    }

    /** On ne vend pas ce qu'on n'a pas : la disponibilité tient compte des réserves. */
    public function test_an_order_beyond_the_available_stock_is_refused(): void
    {
        $zone = $this->zone();
        $variant = $this->variant(stock: 1);

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone));

        // Le premier passe et réserve l'unique exemplaire.
        $this->assertDatabaseCount('orders', 1);

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone))->assertRedirect();

        $this->assertDatabaseCount('orders', 1);
    }

    /*
    |--------------------------------------------------------------------------
    | Suivi
    |--------------------------------------------------------------------------
    */

    /** Le suivi fonctionne sans compte : c'est tout l'intérêt du jeton. */
    public function test_the_tracking_link_works_without_an_account(): void
    {
        $zone = $this->zone();
        $variant = $this->variant();

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone));

        $order = Order::firstOrFail();

        $this->get("/boutique/suivi/{$order->tracking_token}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('order.reference', $order->reference));

        // Le numéro seul ne donne pas accès : il se devine.
        $this->get('/boutique/suivi/'.$order->reference)->assertNotFound();
    }

    /*
    |--------------------------------------------------------------------------
    | Comptes clients
    |--------------------------------------------------------------------------
    */

    /** S'inscrire en ligne rattache le mot de passe à la fiche existante. */
    public function test_registering_reuses_an_existing_customer_record(): void
    {
        $existing = $this->customer(['name' => 'Client du comptoir']);

        $this->post('/boutique/inscription', [
            'name' => 'Fatou Ndiaye',
            'phone' => '77 885 83 74',
            'password' => 'motdepasse123',
            'password_confirmation' => 'motdepasse123',
        ])->assertRedirect('/boutique/espace');

        $this->assertDatabaseCount('customers', 1);
        $this->assertTrue($existing->fresh()?->hasWebAccount());
    }

    public function test_a_client_reaches_their_area_but_not_the_back_office(): void
    {
        $customer = $this->customer(['password' => Hash::make('motdepasse123')]);

        $this->post('/boutique/connexion', [
            'identifiant' => '77 885 83 74',
            'password' => 'motdepasse123',
        ])->assertRedirect('/boutique/espace');

        $this->get('/boutique/espace')->assertOk();

        // La garde du personnel est distincte : l'acheteur n'y a pas accès.
        $this->get('/dashboard')->assertRedirect('/login');
        $this->assertSame($customer->id, auth('client')->id());
    }

    public function test_a_client_only_sees_their_own_orders(): void
    {
        $zone = $this->zone();
        $variant = $this->variant();
        $mine = $this->customer(['password' => Hash::make('motdepasse123')]);
        $other = $this->customer(['name' => 'Autre', 'phone' => '77 111 22 33']);

        $this->actingAs($mine, 'client');
        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone));

        Order::create([
            'reference' => 'C-2026-9999',
            'tracking_token' => 'jeton-autre',
            'customer_id' => $other->id,
            'customer_name' => 'Autre',
            'customer_phone' => '77 111 22 33',
            'delivery_address' => 'Ailleurs',
            'total' => 10000,
            'status' => OrderStatus::EnAttente->value,
            'placed_at' => now(),
        ]);

        $this->get('/boutique/espace/commandes')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->count('orders.data', 1));
    }

    /*
    |--------------------------------------------------------------------------
    | Chacun chez soi
    |--------------------------------------------------------------------------
    */

    /**
     * Un visiteur non connecté qui vise l'espace client atterrit sur la
     * connexion de la boutique — jamais sur celle du logiciel de gestion.
     */
    public function test_a_guest_is_sent_to_the_shop_login_not_the_back_office(): void
    {
        foreach ([
            '/boutique/espace',
            '/boutique/espace/coffres',
            '/boutique/espace/commandes',
            '/boutique/espace/profil',
        ] as $url) {
            $this->get($url)->assertRedirect('/boutique/connexion');
        }

        // Et le personnel garde la sienne.
        $this->get('/dashboard')->assertRedirect('/login');
    }

    /** Un client déjà connecté ne retombe pas sur le tableau de bord interne. */
    public function test_a_logged_in_client_is_sent_back_to_their_own_area(): void
    {
        $customer = $this->customer(['password' => Hash::make('motdepasse123')]);

        $this->actingAs($customer, 'client')
            ->get('/boutique/connexion')
            ->assertRedirect('/boutique/espace');
    }

    /** « Le coffre » du menu s'explique avant de demander un compte. */
    public function test_the_vault_page_is_public(): void
    {
        $this->get('/boutique/coffre')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('mesCoffres', null));

        $customer = $this->customer(['password' => Hash::make('motdepasse123')]);
        app(VaultService::class)->open($customer, 'Ma valise', 100000);

        $this->actingAs($customer, 'client')
            ->get('/boutique/coffre')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->count('mesCoffres', 1));
    }

    /*
    |--------------------------------------------------------------------------
    | Le coffre
    |--------------------------------------------------------------------------
    */

    /** Le solde est la somme des versements, jamais un total tenu à part. */
    public function test_the_vault_balance_is_the_sum_of_its_deposits(): void
    {
        $customer = $this->customer();
        $vaults = app(VaultService::class);

        $vault = $vaults->open($customer, 'Ma valise', 100000);

        $vaults->deposit($vault, 30000);
        $vaults->deposit($vault->fresh() ?? $vault, 20000);

        $fresh = $vault->fresh();

        $this->assertSame(50000, $fresh?->saved_amount);
        $this->assertSame(50000, $fresh->remaining_amount);
        $this->assertSame(50, $fresh->progress);
        $this->assertSame(VaultStatus::Ouvert, $fresh->status);
    }

    /** L'objectif atteint bascule le coffre tout seul. */
    public function test_reaching_the_target_flips_the_vault(): void
    {
        $vaults = app(VaultService::class);
        $vault = $vaults->open($this->customer(), 'Ma valise', 50000);

        $vaults->deposit($vault, 50000);

        $fresh = $vault->fresh();

        $this->assertSame(VaultStatus::Atteint, $fresh?->status);
        $this->assertNotNull($fresh->reached_at);
        $this->assertTrue($fresh->isSpendable());
    }

    /** Un remboursement est un versement négatif : le carnet reste lisible. */
    public function test_a_refund_is_recorded_not_erased(): void
    {
        $vaults = app(VaultService::class);
        $vault = $vaults->open($this->customer(), 'Ma valise', 100000);

        $vaults->deposit($vault, 40000);
        $vaults->refund($vault->fresh() ?? $vault);

        $fresh = $vault->fresh();

        $this->assertSame(0, $fresh?->saved_amount);
        $this->assertSame(VaultStatus::Annule, $fresh->status);
        $this->assertDatabaseCount('vault_deposits', 2);
    }

    /** Un coffre plein règle la commande d'avance. */
    public function test_a_full_vault_pays_the_order(): void
    {
        $zone = $this->zone(2000);
        $variant = $this->variant(price: 45000);
        $customer = $this->customer(['password' => Hash::make('motdepasse123')]);

        $vaults = app(VaultService::class);
        $vault = $vaults->open($customer, 'Ma valise', 47000);
        $vaults->deposit($vault, 47000);

        $this->actingAs($customer, 'client');
        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone, [
            'vault_id' => $vault->id,
        ]))->assertRedirect();

        $order = Order::firstOrFail();

        $this->assertSame(47000, $order->total);
        $this->assertSame(47000, $order->amount_paid);
        $this->assertSame(0, $order->balance_due);
        $this->assertSame(VaultStatus::Utilise, $vault->fresh()?->status);
    }

    /** Un coffre trop maigre ne passe pas — frais de livraison compris. */
    public function test_a_vault_that_does_not_cover_the_total_is_refused(): void
    {
        $zone = $this->zone(5000);
        $variant = $this->variant(price: 45000);
        $customer = $this->customer(['password' => Hash::make('motdepasse123')]);

        $vaults = app(VaultService::class);
        $vault = $vaults->open($customer, 'Ma valise', 45000);
        $vaults->deposit($vault, 45000);

        $this->actingAs($customer, 'client');
        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone, [
            'vault_id' => $vault->id,
        ]));

        $this->assertDatabaseCount('orders', 0);
        $this->assertSame(VaultStatus::Atteint, $vault->fresh()?->status);
    }

    /** Le coffre d'autrui reste le coffre d'autrui. */
    public function test_a_customer_cannot_spend_someone_elses_vault(): void
    {
        $zone = $this->zone();
        $variant = $this->variant();
        $mine = $this->customer(['password' => Hash::make('motdepasse123')]);
        $other = $this->customer(['name' => 'Autre', 'phone' => '77 111 22 33']);

        $vaults = app(VaultService::class);
        $vault = $vaults->open($other, 'Coffre voisin', 50000);
        $vaults->deposit($vault, 200000);

        $this->actingAs($mine, 'client');
        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->checkoutPayload($zone, [
            'vault_id' => $vault->id,
        ]));

        $this->assertDatabaseCount('orders', 0);
    }

    /*
    |--------------------------------------------------------------------------
    | Back-office
    |--------------------------------------------------------------------------
    */

    public function test_the_shop_screens_are_reachable_by_staff(): void
    {
        $gerant = User::factory()->create(['role' => UserRole::Gerant->value]);
        $vendeur = User::factory()->create(['role' => UserRole::Vendeur->value]);

        // La boutique en ligne est entierement reservee au gerant : commandes,
        // coffres, messages recus et reglages.
        $this->actingAs($vendeur)->get('/commandes')->assertForbidden();
        $this->actingAs($vendeur)->get('/coffres')->assertForbidden();
        $this->actingAs($gerant)->get('/commandes')->assertOk();
        $this->actingAs($gerant)->get('/coffres')->assertOk();

        $this->actingAs($vendeur)->get('/contacts')->assertForbidden();
        $this->actingAs($vendeur)->get('/reglages/livraison')->assertForbidden();

        $this->actingAs($gerant)->get('/contacts')->assertOk();
        $this->actingAs($gerant)->get('/reglages/livraison')->assertOk();
        $this->actingAs($gerant)->get('/reglages/accueil-boutique')->assertOk();
    }

    public function test_a_contact_message_lands_in_the_back_office(): void
    {
        $this->post('/boutique/contact', [
            'name' => 'Moussa Diop',
            'phone' => '77 000 00 00',
            'subject' => 'Disponibilité',
            'body' => 'Avez-vous la valise cabine en noir ?',
        ])->assertRedirect();

        $this->assertDatabaseHas('contact_messages', [
            'name' => 'Moussa Diop',
            'status' => 'nouveau',
        ]);

        $gerant = User::factory()->create(['role' => UserRole::Gerant->value]);

        $this->actingAs($gerant)
            ->get('/contacts')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('totals.new', 1));
    }

    /** Une promotion programmée n'apparaît qu'entre ses deux dates. */
    public function test_a_scheduled_home_block_appears_only_within_its_window(): void
    {
        $product = Product::factory()->create(['is_published' => true]);

        HomeBlock::create([
            'type' => 'promo',
            'title' => 'Soldes de septembre',
            'product_id' => $product->id,
            'is_active' => true,
            'starts_at' => now()->addWeek(),
            'ends_at' => now()->addMonth(),
        ]);

        $this->get('/boutique')
            ->assertInertia(fn ($page) => $page->count('promos', 0));

        $this->travel(2)->weeks();

        $this->get('/boutique')
            ->assertInertia(fn ($page) => $page->count('promos', 1));
    }
}
