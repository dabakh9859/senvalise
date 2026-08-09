<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\ProductVariant;
use App\Services\Shop\GeolocationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Position de livraison.
 *
 * Deux exigences guident ces tests : la position doit **aider** le livreur
 * quand elle est là, et son absence ne doit **jamais** empêcher de commander.
 * Le consentement, lui, doit pouvoir être retiré aussi facilement qu'il a été
 * donné.
 */
class GeolocationTest extends TestCase
{
    use RefreshDatabase;

    /** Place du Souvenir, Dakar. */
    private const DAKAR_LAT = 14.6928;

    private const DAKAR_LNG = -17.4467;

    protected function geo(): GeolocationService
    {
        return app(GeolocationService::class);
    }

    protected function zone(array $attributes = []): DeliveryZone
    {
        return DeliveryZone::create([
            'name' => 'Dakar centre',
            'city' => 'Dakar',
            'fee' => 2000,
            'delay_days' => 1,
            'is_active' => true,
            ...$attributes,
        ]);
    }

    protected function variant(): ProductVariant
    {
        $variant = ProductVariant::factory()->withStock(10, 20000)->create([
            'selling_price' => 45000,
            'web_price' => 45000,
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
    protected function payload(DeliveryZone $zone, array $overrides = []): array
    {
        return [
            'customer_name' => 'Fatou Ndiaye',
            'customer_phone' => '77 885 83 74',
            'delivery_address' => 'Sacré-Cœur 3, villa 128',
            'delivery_zone_id' => $zone->id,
            'payment_method' => 'especes',
            ...$overrides,
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Le calcul
    |--------------------------------------------------------------------------
    */

    public function test_the_distance_is_measured_as_the_crow_flies(): void
    {
        // Dakar → Thiès : environ 60 km à vol d'oiseau.
        $distance = $this->geo()->distance(
            self::DAKAR_LAT,
            self::DAKAR_LNG,
            14.7833,
            -16.9333,
        );

        $this->assertGreaterThan(50, $distance);
        $this->assertLessThan(70, $distance);
    }

    /** (0, 0) tombe dans le golfe de Guinée : c'est une valeur oubliée, pas une position. */
    public function test_null_island_is_rejected(): void
    {
        $this->assertFalse($this->geo()->isValid(0.0, 0.0));
        $this->assertFalse($this->geo()->isValid(null, null));
        $this->assertFalse($this->geo()->isValid(95.0, 10.0));
        $this->assertTrue($this->geo()->isValid(self::DAKAR_LAT, self::DAKAR_LNG));
    }

    /*
    |--------------------------------------------------------------------------
    | Suggestion de zone
    |--------------------------------------------------------------------------
    */

    /** Une zone qui couvre réellement le point bat une zone simplement plus proche. */
    public function test_a_zone_that_covers_the_point_wins(): void
    {
        $couvrante = $this->zone([
            'name' => 'Dakar centre',
            'latitude' => 14.6737,
            'longitude' => -17.4344,
            'radius_km' => 10,
        ]);

        // Plus proche en distance, mais sans rayon déclaré.
        $this->zone([
            'name' => 'Point sans portée',
            'latitude' => self::DAKAR_LAT,
            'longitude' => self::DAKAR_LNG,
            'radius_km' => null,
        ]);

        $match = $this->geo()->suggestZone(self::DAKAR_LAT, self::DAKAR_LNG);

        $this->assertNotNull($match);
        $this->assertSame($couvrante->id, $match['zone']->id);
        $this->assertTrue($match['covers']);
    }

    /** Trop loin, on ne propose rien : une suggestion fausse coûte plus cher qu'aucune. */
    public function test_nothing_is_suggested_from_far_away(): void
    {
        $this->zone([
            'latitude' => 14.6737,
            'longitude' => -17.4344,
            'radius_km' => 5,
        ]);

        // Paris.
        $this->assertNull($this->geo()->suggestZone(48.8566, 2.3522));
    }

    public function test_a_zone_without_a_centre_is_never_suggested(): void
    {
        $this->zone(['latitude' => null, 'longitude' => null]);

        $this->assertNull(
            $this->geo()->suggestZone(self::DAKAR_LAT, self::DAKAR_LNG),
        );
    }

    public function test_the_shop_answers_with_the_nearest_zone(): void
    {
        $zone = $this->zone([
            'latitude' => 14.6737,
            'longitude' => -17.4344,
            'radius_km' => 10,
        ]);

        $this->postJson('/boutique/commande/zone-proche', [
            'latitude' => self::DAKAR_LAT,
            'longitude' => self::DAKAR_LNG,
        ])
            ->assertOk()
            ->assertJsonPath('zone.id', $zone->id)
            ->assertJsonPath('zone.covers', true);
    }

    public function test_the_shop_answers_nothing_rather_than_guessing(): void
    {
        $this->postJson('/boutique/commande/zone-proche', [
            'latitude' => self::DAKAR_LAT,
            'longitude' => self::DAKAR_LNG,
        ])
            ->assertOk()
            ->assertJsonPath('zone', null);
    }

    /*
    |--------------------------------------------------------------------------
    | À la commande
    |--------------------------------------------------------------------------
    */

    public function test_the_position_is_frozen_on_the_order(): void
    {
        $zone = $this->zone();
        $variant = $this->variant();

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->payload($zone, [
            'latitude' => self::DAKAR_LAT,
            'longitude' => self::DAKAR_LNG,
            'location_accuracy' => 12,
        ]))->assertRedirect();

        $order = Order::firstOrFail();

        $this->assertTrue($order->hasLocation());
        $this->assertEqualsWithDelta(self::DAKAR_LAT, $order->latitude, 0.0001);
        $this->assertSame(12, $order->location_accuracy);
        $this->assertNotNull($order->located_at);
    }

    /** Refuser la localisation n'empêche jamais de commander. */
    public function test_an_order_without_a_position_goes_through(): void
    {
        $zone = $this->zone();
        $variant = $this->variant();

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->payload($zone))->assertRedirect();

        $order = Order::firstOrFail();

        $this->assertFalse($order->hasLocation());
        $this->assertNull($order->latitude);
    }

    /** Une position aberrante est écartée en silence plutôt que stockée. */
    public function test_an_impossible_position_is_dropped(): void
    {
        $zone = $this->zone();
        $variant = $this->variant();

        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->payload($zone, [
            'latitude' => 0,
            'longitude' => 0,
        ]))->assertRedirect();

        $this->assertFalse(Order::firstOrFail()->hasLocation());
    }

    /*
    |--------------------------------------------------------------------------
    | Consentement
    |--------------------------------------------------------------------------
    */

    /** Le client connecté qui partage sa position la retrouve la fois d'après. */
    public function test_a_shared_position_is_remembered_for_next_time(): void
    {
        $zone = $this->zone();
        $variant = $this->variant();
        $customer = $this->customer(['password' => Hash::make('motdepasse123')]);

        $this->actingAs($customer, 'client');
        $this->post('/boutique/panier', ['variant_id' => $variant->id, 'quantity' => 1]);
        $this->post('/boutique/commande', $this->payload($zone, [
            'latitude' => self::DAKAR_LAT,
            'longitude' => self::DAKAR_LNG,
            'location_accuracy' => 20,
        ]));

        $fresh = $customer->fresh();

        $this->assertTrue($fresh?->hasLocation());
        // La date de consentement fait foi : sans elle, impossible de prouver
        // que le client a accepté.
        $this->assertNotNull($fresh->location_consent_at);
    }

    /** Un consentement qu'on ne peut pas retirer n'en est pas un. */
    public function test_the_customer_can_erase_their_position(): void
    {
        $customer = $this->customer([
            'password' => Hash::make('motdepasse123'),
            'latitude' => self::DAKAR_LAT,
            'longitude' => self::DAKAR_LNG,
            'location_accuracy' => 15,
            'located_at' => now(),
            'location_consent_at' => now(),
        ]);

        $this->assertTrue($customer->hasLocation());

        $this->actingAs($customer, 'client')
            ->delete('/boutique/espace/position')
            ->assertRedirect();

        $fresh = $customer->fresh();

        $this->assertFalse($fresh?->hasLocation());
        $this->assertNull($fresh->latitude);
        // Le consentement s'efface avec la position : la prochaine fois,
        // l'autorisation sera redemandée depuis le début.
        $this->assertNull($fresh->location_consent_at);
    }

    /** Sans consentement daté, la position n'est pas considérée comme acquise. */
    public function test_coordinates_without_consent_do_not_count(): void
    {
        $customer = $this->customer([
            'latitude' => self::DAKAR_LAT,
            'longitude' => self::DAKAR_LNG,
            'location_consent_at' => null,
        ]);

        $this->assertFalse($customer->hasLocation());
    }

    /*
    |--------------------------------------------------------------------------
    | Côté boutique
    |--------------------------------------------------------------------------
    */

    /** Le lien de carte n'expose la position d'aucun client à un tiers exigeant un compte. */
    public function test_the_map_link_points_to_openstreetmap(): void
    {
        $url = $this->geo()->mapUrl(self::DAKAR_LAT, self::DAKAR_LNG);

        $this->assertStringContainsString('openstreetmap.org', $url);
        $this->assertStringContainsString('14.692800', $url);
    }

    public function test_the_accuracy_is_written_in_plain_french(): void
    {
        $this->assertSame('à 12 m près', $this->geo()->accuracyLabel(12));
        $this->assertSame('à 1,5 km près', $this->geo()->accuracyLabel(1500));
        $this->assertNull($this->geo()->accuracyLabel(null));
    }
}
