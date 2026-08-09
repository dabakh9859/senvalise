<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        $defaults = [
            'shop_name' => 'SenValise',
            'shop_tagline' => 'Vente de valises et bagages',
            'shop_phone' => '77 885 83 74',
            'shop_email' => '',
            'shop_address' => 'Dakar, Sénégal',
            'shop_ninea' => '',
            'shop_rc' => '',

            // TVA à 0 par défaut : la plupart des petites boutiques ne sont pas
            // assujetties. Passer à 18 dans les réglages si besoin.
            'tax_rate' => '0',
            'tax_label' => 'TVA',

            'barcode_prefix' => '200',
            'allow_negative_stock' => 'false',
            'default_low_stock_threshold' => '3',

            'quote_validity_days' => '15',
            'invoice_terms' => "Marchandise vendue non reprise, ni échangée.\nMerci de votre confiance.",
            'receipt_footer' => 'Merci de votre visite — SenValise',
        ];

        foreach ($defaults as $key => $value) {
            // updateOrCreate seulement si absent : on n'écrase pas ce que le
            // gérant a déjà réglé.
            Setting::firstOrCreate(
                ['key' => $key],
                ['value' => $value, 'type' => $this->typeOf($key)],
            );
        }
    }

    protected function typeOf(string $key): string
    {
        return match ($key) {
            'allow_negative_stock' => 'boolean',
            'tax_rate', 'default_low_stock_threshold', 'quote_validity_days' => 'integer',
            default => 'string',
        };
    }
}
