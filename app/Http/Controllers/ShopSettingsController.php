<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Setting;
use App\Services\ImageStorageService;
use App\Support\Barcode;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class ShopSettingsController extends Controller
{
    /**
     * Clé du fichier de logo.
     *
     * Volontairement hors de FIELDS : c'est un fichier, pas une valeur
     * de formulaire, et il se remplace sans passer par le même chemin.
     */
    public const LOGO_KEY = 'shop_logo_path';

    /** Clés modifiables depuis l'écran, avec leur type de stockage. */
    protected const FIELDS = [
        'shop_name' => 'string',
        'shop_tagline' => 'string',
        'shop_phone' => 'string',
        'shop_email' => 'string',
        'shop_address' => 'string',
        'shop_ninea' => 'string',
        'shop_rc' => 'string',
        'tax_rate' => 'integer',
        'tax_label' => 'string',
        'barcode_prefix' => 'string',
        'allow_negative_stock' => 'boolean',
        'default_low_stock_threshold' => 'integer',
        'quote_validity_days' => 'integer',
        'invoice_terms' => 'string',
        'receipt_footer' => 'string',
    ];

    public function __construct(private readonly ImageStorageService $images) {}

    public function edit(): Response
    {
        $values = Setting::values();

        return Inertia::render('reglages/boutique', [
            'settings' => collect(self::FIELDS)
                ->mapWithKeys(fn (string $type, string $key) => [
                    $key => $values[$key] ?? ($type === 'boolean' ? false : ''),
                ])
                ->all(),
            'barcodeSample' => Barcode::svg(Barcode::forVariant(1), 200, 52),
            'logo' => $this->logoUrl(),
        ]);
    }

    /** Retire le logo et revient à l'écusson dessiné. */
    public function destroyLogo(): RedirectResponse
    {
        $chemin = Setting::get(self::LOGO_KEY);

        if (filled($chemin)) {
            Storage::disk('public')->delete((string) $chemin);
        }

        Setting::put(self::LOGO_KEY, '');

        ActivityLog::record('reglages', 'Logo de la boutique retiré');
        $this->toast('Logo retiré.');

        return back();
    }

    /** Adresse publique du logo, s'il a été déposé. */
    public static function logoUrl(): ?string
    {
        $chemin = Setting::get(self::LOGO_KEY);

        return filled($chemin)
            ? Storage::disk('public')->url((string) $chemin)
            : null;
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'shop_name' => ['required', 'string', 'max:120'],
            'shop_tagline' => ['nullable', 'string', 'max:180'],
            'shop_phone' => ['nullable', 'string', 'max:40'],
            'shop_email' => ['nullable', 'email', 'max:180'],
            'shop_address' => ['nullable', 'string', 'max:255'],
            'shop_ninea' => ['nullable', 'string', 'max:60'],
            'shop_rc' => ['nullable', 'string', 'max:60'],
            'tax_rate' => ['required', 'integer', 'min:0', 'max:100'],
            'tax_label' => ['nullable', 'string', 'max:30'],
            'barcode_prefix' => ['required', 'string', 'regex:/^\d{2,4}$/'],
            'allow_negative_stock' => ['boolean'],
            'default_low_stock_threshold' => ['required', 'integer', 'min:0', 'max:9999'],
            'quote_validity_days' => ['required', 'integer', 'min:1', 'max:365'],
            'invoice_terms' => ['nullable', 'string', 'max:2000'],
            'receipt_footer' => ['nullable', 'string', 'max:500'],
            // Le logo de l'enseigne : PNG transparent ou SVG de préférence.
            'logo' => ['nullable', 'image', 'max:4096'],
        ], [
            'barcode_prefix.regex' => 'Le préfixe doit contenir 2 à 4 chiffres (200 à 299 est réservé à un usage interne).',
        ]);

        if ($request->hasFile('logo')) {
            $ancien = Setting::get(self::LOGO_KEY);

            if (filled($ancien)) {
                Storage::disk('public')->delete((string) $ancien);
            }

            Setting::put(
                self::LOGO_KEY,
                $this->images->store($request->file('logo'), 'marque'),
            );
        }

        unset($validated['logo']);

        foreach (self::FIELDS as $key => $type) {
            if (! array_key_exists($key, $validated)) {
                continue;
            }

            Setting::put($key, match ($type) {
                'integer' => (int) $validated[$key],
                'boolean' => (bool) $validated[$key],
                default => (string) ($validated[$key] ?? ''),
            });
        }

        ActivityLog::record('reglages', 'Réglages de la boutique mis à jour');
        $this->toast('Réglages enregistrés.');

        return back();
    }
}
