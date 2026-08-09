<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Product;
use App\Models\Setting;
use App\Models\User;
use App\Services\ImageSearchService;
use App\Services\ProductImageService;
use App\Services\RemoteImageFetcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class ImageSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        config()->set('services.serpapi.key', null);
    }

    protected function gerant(): User
    {
        return User::factory()->create(['role' => UserRole::Gerant->value]);
    }

    /*
    |--------------------------------------------------------------------------
    | La clé
    |--------------------------------------------------------------------------
    */

    public function test_the_key_is_stored_encrypted_and_never_shown_in_full(): void
    {
        Setting::putSecret(ImageSearchService::SETTING_KEY, 'cle-secrete-123456');

        $stored = Setting::where('key', ImageSearchService::SETTING_KEY)->firstOrFail();

        $this->assertStringNotContainsString('cle-secrete', $stored->value);

        $service = app(ImageSearchService::class);

        $this->assertSame('cle-secrete-123456', $service->apiKey());
        $this->assertSame('••••••••3456', $service->maskedKey());
    }

    public function test_the_settings_screen_never_returns_the_full_key(): void
    {
        Setting::putSecret(ImageSearchService::SETTING_KEY, 'tres-secret-abcd');

        $response = $this->actingAs($this->gerant())->get('/reglages/integrations');

        $response->assertOk();
        $response->assertDontSee('tres-secret-abcd');
        $response->assertInertia(fn ($page) => $page
            ->where('imageSearch.configured', true)
            ->where('imageSearch.maskedKey', '••••••••abcd'));
    }

    public function test_the_key_can_be_saved_and_removed_from_the_settings_screen(): void
    {
        $gerant = $this->gerant();

        $this->actingAs($gerant)
            ->put('/reglages/integrations', ['serpapi_key' => 'nouvelle-cle'])
            ->assertRedirect();

        $this->assertSame('nouvelle-cle', app(ImageSearchService::class)->apiKey());

        $this->actingAs($gerant)
            ->put('/reglages/integrations', ['serpapi_key' => ''])
            ->assertRedirect();

        $this->assertNull(app(ImageSearchService::class)->apiKey());
    }

    public function test_a_seller_cannot_reach_the_integrations_screen(): void
    {
        $this->actingAs(User::factory()->create(['role' => UserRole::Vendeur->value]))
            ->get('/reglages/integrations')
            ->assertForbidden();
    }

    /*
    |--------------------------------------------------------------------------
    | La recherche
    |--------------------------------------------------------------------------
    */

    public function test_the_search_says_so_when_no_key_is_configured(): void
    {
        $this->actingAs($this->gerant())
            ->getJson('/produits/recherche-images?q=valise')
            ->assertOk()
            ->assertJson(['configured' => false, 'results' => []]);
    }

    public function test_the_search_returns_normalised_results(): void
    {
        Setting::putSecret(ImageSearchService::SETTING_KEY, 'cle');

        Http::fake([
            'serpapi.com/*' => Http::response([
                'images_results' => [
                    [
                        'original' => 'https://exemple.test/valise.jpg',
                        'thumbnail' => 'https://exemple.test/mini.jpg',
                        'title' => 'Valise cabine',
                        'source' => 'exemple.test',
                        'original_width' => 1200,
                        'original_height' => 900,
                    ],
                    // Sans URL d'origine : inutilisable, doit être écartée.
                    ['thumbnail' => 'https://exemple.test/mini2.jpg'],
                ],
            ]),
        ]);

        $response = $this->actingAs($this->gerant())
            ->getJson('/produits/recherche-images?q=valise cabine');

        $response->assertOk();
        $response->assertJsonCount(1, 'results');
        $response->assertJsonPath('results.0.url', 'https://exemple.test/valise.jpg');
        $response->assertJsonPath('results.0.source', 'exemple.test');
    }

    /** La clé ne doit jamais partir vers le navigateur, seulement vers SerpAPI. */
    public function test_the_key_stays_on_the_server(): void
    {
        Setting::putSecret(ImageSearchService::SETTING_KEY, 'cle-ultra-secrete');

        Http::fake(['serpapi.com/*' => Http::response(['images_results' => []])]);

        $response = $this->actingAs($this->gerant())
            ->getJson('/produits/recherche-images?q=valise');

        $response->assertOk();
        $this->assertStringNotContainsString('cle-ultra-secrete', $response->getContent());

        Http::assertSent(fn ($request) => str_contains($request->url(), 'cle-ultra-secrete'));
    }

    public function test_a_serpapi_error_is_reported_without_breaking_the_page(): void
    {
        Setting::putSecret(ImageSearchService::SETTING_KEY, 'cle');

        Http::fake(['serpapi.com/*' => Http::response(['error' => 'Quota épuisé'], 200)]);

        $this->actingAs($this->gerant())
            ->getJson('/produits/recherche-images?q=valise')
            ->assertOk()
            ->assertJson(['message' => 'Quota épuisé', 'results' => []]);
    }

    public function test_a_seller_cannot_search(): void
    {
        $this->actingAs(User::factory()->create(['role' => UserRole::Vendeur->value]))
            ->getJson('/produits/recherche-images?q=valise')
            ->assertForbidden();
    }

    /*
    |--------------------------------------------------------------------------
    | Le téléchargement des images distantes
    |--------------------------------------------------------------------------
    */

    /** @return array<int, array<int, string>> */
    public static function forbiddenUrls(): array
    {
        return [
            ['http://127.0.0.1/photo.jpg'],
            ['http://localhost/photo.jpg'],
            ['http://10.0.0.5/photo.jpg'],
            ['http://192.168.1.10/photo.jpg'],
            ['http://169.254.169.254/latest/meta-data'],
            ['http://[::1]/photo.jpg'],
            ['file:///etc/passwd'],
            ['ftp://exemple.test/photo.jpg'],
        ];
    }

    /**
     * Faire télécharger une adresse quelconque par le serveur permettrait
     * d'atteindre le réseau interne — chaque cas ci-dessous doit être refusé.
     */
    #[DataProvider('forbiddenUrls')]
    public function test_internal_addresses_are_refused(string $url): void
    {
        $this->expectException(RuntimeException::class);

        app(RemoteImageFetcher::class)->fetch($url);
    }

    public function test_a_downloaded_file_that_is_not_an_image_is_refused(): void
    {
        Http::fake(['*' => Http::response('ceci est du texte', 200)]);

        $this->expectException(RuntimeException::class);

        app(RemoteImageFetcher::class)->fetch('https://8.8.8.8/faux.jpg');
    }

    /*
    |--------------------------------------------------------------------------
    | L'import dans la fiche produit
    |--------------------------------------------------------------------------
    */

    public function test_a_chosen_image_is_downloaded_and_stored_with_the_product(): void
    {
        $this->fakeFetcher();

        $this->actingAs($this->gerant())
            ->post('/produits', [
                'name' => 'Valise trouvée en ligne',
                'is_active' => true,
                'variants' => [['selling_price' => 50000, 'is_active' => true]],
                'image_urls' => ['https://exemple.test/valise.jpg'],
            ])
            ->assertRedirect();

        $product = Product::firstOrFail();

        $this->assertCount(1, $product->images);
        Storage::disk('public')->assertExists($product->images->first()->path);
        $this->assertStringEndsWith('.webp', $product->images->first()->path);
    }

    /** Une image morte ne doit pas faire échouer l'enregistrement du produit. */
    public function test_an_unreachable_image_does_not_lose_the_product(): void
    {
        $this->app->bind(RemoteImageFetcher::class, fn () => new class extends RemoteImageFetcher
        {
            public function fetch(string $url): string
            {
                throw new RuntimeException('Image introuvable.');
            }
        });

        $this->actingAs($this->gerant())
            ->post('/produits', [
                'name' => 'Valise sans photo',
                'is_active' => true,
                'variants' => [['selling_price' => 50000, 'is_active' => true]],
                'image_urls' => ['https://exemple.test/disparue.jpg'],
            ])
            ->assertRedirect();

        $product = Product::firstOrFail();

        $this->assertSame('Valise sans photo', $product->name);
        $this->assertCount(0, $product->images);
    }

    public function test_an_invalid_url_is_rejected_by_validation(): void
    {
        $this->actingAs($this->gerant())
            ->post('/produits', [
                'name' => 'Valise',
                'is_active' => true,
                'variants' => [['selling_price' => 50000, 'is_active' => true]],
                'image_urls' => ['pas-une-adresse'],
            ])
            ->assertSessionHasErrors('image_urls.0');
    }

    /** Remplace le téléchargeur par un faux qui renvoie une vraie image. */
    protected function fakeFetcher(): void
    {
        $png = $this->onePixelPng();

        $this->app->bind(RemoteImageFetcher::class, fn () => new class($png) extends RemoteImageFetcher
        {
            public function __construct(private readonly string $bytes) {}

            public function fetch(string $url): string
            {
                return $this->bytes;
            }
        });

        // Le service est résolu à la construction : on le reconstruit aussi.
        $this->app->forgetInstance(ProductImageService::class);
    }

    protected function onePixelPng(): string
    {
        $image = imagecreatetruecolor(40, 30);
        ob_start();
        imagepng($image);
        $binary = (string) ob_get_clean();
        imagedestroy($image);

        return $binary;
    }
}
