<?php

namespace App\Support;

use App\Models\Setting;
use Picqer\Barcode\Renderers\PngRenderer;
use Picqer\Barcode\Renderers\SvgRenderer;
use Picqer\Barcode\Types\TypeEan13;
use Throwable;

/**
 * Génération et rendu des codes-barres EAN-13.
 *
 * Les codes fabriqués en interne utilisent le préfixe 200-299, réservé par
 * GS1 à la circulation interne : aucun risque de collision avec le code d'un
 * fabricant si un jour on scanne des articles déjà codés.
 *
 * Le numéro de séquence est l'identifiant de la variante, ce qui garantit
 * l'unicité sans table de compteurs.
 */
class Barcode
{
    public const DEFAULT_PREFIX = '200';

    /** Construit un EAN-13 valide pour une variante donnée. */
    public static function forVariant(int $variantId): string
    {
        $prefix = self::prefix();
        $sequence = str_pad((string) $variantId, 12 - strlen($prefix), '0', STR_PAD_LEFT);

        return self::withCheckDigit($prefix.$sequence);
    }

    /** Ajoute le chiffre de contrôle à 12 chiffres. */
    public static function withCheckDigit(string $twelveDigits): string
    {
        return (new TypeEan13)->getBarcode($twelveDigits)->getBarcode();
    }

    public static function isValid(string $code): bool
    {
        $code = trim($code);

        if (! preg_match('/^\d{13}$/', $code)) {
            return false;
        }

        try {
            (new TypeEan13)->getBarcode($code);

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    /** SVG inline, pour l'affichage écran et les planches d'étiquettes. */
    public static function svg(string $code, float $width = 200, float $height = 50): ?string
    {
        try {
            $barcode = (new TypeEan13)->getBarcode($code);

            $renderer = new SvgRenderer;
            $renderer->setSvgType(SvgRenderer::TYPE_SVG_INLINE);

            return $renderer->render($barcode, $width, $height);
        } catch (Throwable) {
            return null;
        }
    }

    /** PNG encodé en data URI — nécessaire pour l'export PDF (dompdf). */
    public static function pngDataUri(string $code, int $widthFactor = 2, int $height = 50): ?string
    {
        try {
            $barcode = (new TypeEan13)->getBarcode($code);

            $png = (new PngRenderer)->render($barcode, $barcode->getWidth() * $widthFactor, $height);

            return 'data:image/png;base64,'.base64_encode($png);
        } catch (Throwable) {
            return null;
        }
    }

    /** Découpe lisible pour l'humain : 2 001 234 567 890 5 */
    public static function humanReadable(string $code): string
    {
        if (strlen($code) !== 13) {
            return $code;
        }

        return $code[0].' '.substr($code, 1, 6).' '.substr($code, 7, 6);
    }

    protected static function prefix(): string
    {
        $prefix = (string) Setting::get('barcode_prefix', self::DEFAULT_PREFIX);

        return preg_match('/^\d{2,4}$/', $prefix) ? $prefix : self::DEFAULT_PREFIX;
    }
}
