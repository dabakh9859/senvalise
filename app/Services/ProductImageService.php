<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;
use Intervention\Image\Interfaces\ImageInterface;
use Throwable;

/**
 * Photos des produits.
 *
 * Les fichiers arrivent d'un téléphone : plusieurs méga-octets et souvent
 * pivotés par le capteur. On les redresse d'après leurs données EXIF, on les
 * ramène à une largeur raisonnable et on les ré-encode en WebP — une photo de
 * 4 Mo tombe autour de 100 Ko, ce qui compte pour la boutique en ligne comme
 * pour l'écran du magasin.
 */
class ProductImageService
{
    /** Largeur maximale conservée : au-delà, rien de visible n'est gagné. */
    public const MAX_WIDTH = 1400;

    public const QUALITY = 82;

    public const DISK = 'public';

    public function __construct(private readonly RemoteImageFetcher $fetcher) {}

    public function add(Product $product, UploadedFile $file): ProductImage
    {
        return $this->store(
            $product,
            ImageManager::usingDriver(new Driver)->decodePath($file->getPathname()),
        );
    }

    /** Reprend une image trouvée par la recherche en ligne. */
    public function addFromUrl(Product $product, string $url): ProductImage
    {
        $binary = $this->fetcher->fetch($url);

        return $this->store(
            $product,
            ImageManager::usingDriver(new Driver)->decodeBinary($binary),
        );
    }

    protected function store(Product $product, ImageInterface $image): ProductImage
    {
        // orient() applique la rotation inscrite par le capteur : sans ça, une
        // photo prise à la verticale s'affiche couchée.
        $image->orient()->scaleDown(width: self::MAX_WIDTH);

        $path = "produits/{$product->id}/".Str::uuid()->toString().'.webp';

        Storage::disk(self::DISK)->put(
            $path,
            (string) $image->encode(new WebpEncoder(quality: self::QUALITY)),
        );

        $isFirst = ! $product->images()->exists();

        return $product->images()->create([
            'path' => $path,
            'alt' => $product->name,
            'position' => (int) $product->images()->max('position') + 1,
            'is_primary' => $isFirst,
        ]);
    }

    public function remove(ProductImage $image): void
    {
        $product = $image->product;
        $wasPrimary = $image->is_primary;

        Storage::disk(self::DISK)->delete($image->path);
        $image->delete();

        // La fiche garde toujours une image principale tant qu'il en reste une.
        if ($wasPrimary && $product) {
            $next = $product->images()->orderBy('position')->first();
            $next?->update(['is_primary' => true]);
        }
    }

    public function setPrimary(Product $product, int $imageId): void
    {
        $target = $product->images()->whereKey($imageId)->first();

        if (! $target) {
            return;
        }

        $product->images()->update(['is_primary' => false]);
        $target->update(['is_primary' => true]);
    }

    /**
     * Applique les changements d'images d'un enregistrement de produit.
     *
     * @param  array<int, UploadedFile>  $uploads
     * @param  array<int, int>  $deletedIds
     * @param  array<int, string>  $urls  Images choisies dans la recherche en ligne.
     * @return array<int, string> Les erreurs rencontrées, à remonter au gérant.
     */
    public function sync(
        Product $product,
        array $uploads = [],
        array $deletedIds = [],
        ?int $primaryId = null,
        array $urls = [],
    ): array {
        $errors = [];

        foreach ($deletedIds as $id) {
            $image = $product->images()->whereKey($id)->first();

            if ($image) {
                $this->remove($image);
            }
        }

        foreach ($uploads as $file) {
            if ($file->isValid()) {
                $this->add($product, $file);
            }
        }

        // Une image distante peut avoir disparu ou être protégée : on continue
        // avec les autres plutôt que de faire échouer tout l'enregistrement.
        foreach ($urls as $url) {
            try {
                $this->addFromUrl($product, $url);
            } catch (Throwable $e) {
                $errors[] = $e->getMessage();
            }
        }

        if ($primaryId !== null) {
            $this->setPrimary($product, $primaryId);
        }

        return $errors;
    }

    /** Supprime le dossier d'images du produit (à sa suppression définitive). */
    public function purge(Product $product): void
    {
        Storage::disk(self::DISK)->deleteDirectory("produits/{$product->id}");
    }
}
