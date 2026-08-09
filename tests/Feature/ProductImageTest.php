<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\ProductImageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProductImageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
    }

    protected function gerant(): User
    {
        return User::factory()->create(['role' => UserRole::Gerant->value]);
    }

    /** @return array<string, mixed> */
    protected function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Valise photo',
            'is_active' => true,
            'is_published' => true,
            'variants' => [
                ['selling_price' => 45000, 'size' => 'Cabine', 'is_active' => true],
            ],
        ], $overrides);
    }

    public function test_a_product_can_be_created_with_photos(): void
    {
        $this->actingAs($this->gerant())
            ->post('/produits', $this->payload([
                'images' => [
                    UploadedFile::fake()->image('valise.jpg', 2000, 1500),
                    UploadedFile::fake()->image('valise-2.jpg', 800, 600),
                ],
            ]))
            ->assertRedirect();

        $product = Product::firstOrFail();

        $this->assertCount(2, $product->images);
        Storage::disk('public')->assertExists($product->images->first()->path);
    }

    /** Une photo de 2000 px n'a pas besoin d'être servie telle quelle. */
    public function test_photos_are_resized_and_converted_to_webp(): void
    {
        $product = Product::factory()->create();

        app(ProductImageService::class)->add(
            $product,
            UploadedFile::fake()->image('grande.jpg', 3000, 2000),
        );

        $image = $product->images()->firstOrFail();

        $this->assertStringEndsWith('.webp', $image->path);

        $stored = Storage::disk('public')->get($image->path);
        $size = getimagesizefromstring($stored);

        $this->assertNotFalse($size);
        $this->assertSame(ProductImageService::MAX_WIDTH, $size[0]);
    }

    public function test_the_first_photo_becomes_the_main_one(): void
    {
        $product = Product::factory()->create();
        $service = app(ProductImageService::class);

        $first = $service->add($product, UploadedFile::fake()->image('a.jpg'));
        $second = $service->add($product, UploadedFile::fake()->image('b.jpg'));

        $this->assertTrue($first->fresh()->is_primary);
        $this->assertFalse($second->fresh()->is_primary);
    }

    public function test_the_main_photo_can_be_changed(): void
    {
        $product = Product::factory()->create();
        $service = app(ProductImageService::class);

        $first = $service->add($product, UploadedFile::fake()->image('a.jpg'));
        $second = $service->add($product, UploadedFile::fake()->image('b.jpg'));

        $service->setPrimary($product, $second->id);

        $this->assertFalse($first->fresh()->is_primary);
        $this->assertTrue($second->fresh()->is_primary);
    }

    /** Supprimer la principale doit en promouvoir une autre, pas laisser la fiche sans image. */
    public function test_removing_the_main_photo_promotes_the_next_one(): void
    {
        $product = Product::factory()->create();
        $service = app(ProductImageService::class);

        $first = $service->add($product, UploadedFile::fake()->image('a.jpg'));
        $second = $service->add($product, UploadedFile::fake()->image('b.jpg'));
        $path = $first->path;

        $service->remove($first);

        Storage::disk('public')->assertMissing($path);
        $this->assertTrue($second->fresh()->is_primary);
    }

    public function test_photos_can_be_removed_while_editing_the_product(): void
    {
        $product = Product::factory()->create();
        $variant = ProductVariant::factory()->create(['product_id' => $product->id]);
        $image = app(ProductImageService::class)
            ->add($product, UploadedFile::fake()->image('a.jpg'));

        $this->actingAs($this->gerant())
            ->post("/produits/{$product->id}", $this->payload([
                '_method' => 'put',
                'name' => $product->name,
                'deleted_images' => [$image->id],
                'variants' => [
                    ['id' => $variant->id, 'selling_price' => 45000, 'is_active' => true],
                ],
            ]))
            ->assertRedirect();

        $this->assertCount(0, $product->fresh()->images);
    }

    public function test_a_file_that_is_not_an_image_is_refused(): void
    {
        $this->actingAs($this->gerant())
            ->post('/produits', $this->payload([
                'images' => [UploadedFile::fake()->create('tarif.pdf', 100, 'application/pdf')],
            ]))
            ->assertSessionHasErrors('images.0');

        $this->assertDatabaseCount('products', 0);
    }

    public function test_a_seller_cannot_upload_photos(): void
    {
        $this->actingAs(User::factory()->create(['role' => UserRole::Vendeur->value]))
            ->post('/produits', $this->payload([
                'images' => [UploadedFile::fake()->image('a.jpg')],
            ]))
            ->assertForbidden();
    }
}
