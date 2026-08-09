<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;

/**
 * Enregistrement d'une image hors catalogue : bannières de la page d'accueil,
 * visuels de promotion.
 *
 * Même traitement que les photos de produit — redressement d'après les données
 * EXIF, largeur plafonnée, ré-encodage en WebP — mais sans fiche associée. Une
 * bannière est plus large qu'une photo de produit : elle occupe la pleine
 * largeur de l'écran, d'où les 1920 px.
 *
 * @see ProductImageService pour les photos rattachées à un produit.
 */
class ImageStorageService
{
    public const MAX_WIDTH = 1920;

    public const QUALITY = 82;

    public const DISK = 'public';

    public function store(UploadedFile $file, string $folder): string
    {
        $image = ImageManager::usingDriver(new Driver)
            ->decodePath($file->getPathname())
            ->orient()
            ->scaleDown(width: self::MAX_WIDTH);

        $path = trim($folder, '/').'/'.Str::uuid()->toString().'.webp';

        Storage::disk(self::DISK)->put(
            $path,
            (string) $image->encode(new WebpEncoder(quality: self::QUALITY)),
        );

        return $path;
    }
}
