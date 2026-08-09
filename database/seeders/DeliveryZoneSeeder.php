<?php

namespace Database\Seeders;

use App\Models\DeliveryZone;
use Illuminate\Database\Seeder;

/**
 * Zones de livraison de départ.
 *
 * Sans au moins une zone, personne ne peut commander en ligne : l'écran de
 * commande n'aurait rien à proposer. Ces valeurs sont à ajuster depuis
 * Réglages → Livraison, mais la boutique fonctionne dès la première minute.
 */
class DeliveryZoneSeeder extends Seeder
{
    public function run(): void
    {
        // Les coordonnées sont celles du centre approximatif de chaque zone :
        // elles servent à proposer automatiquement la bonne au client qui
        // accepte de partager sa position. Le rayon dit jusqu'où elle porte.
        $zones = [
            ['name' => 'Dakar — Plateau, Médina', 'city' => 'Dakar', 'fee' => 1500, 'delay_days' => 1, 'position' => 1,
                'latitude' => 14.6737, 'longitude' => -17.4344, 'radius_km' => 5],
            ['name' => 'Dakar — Almadies, Ngor, Ouakam', 'city' => 'Dakar', 'fee' => 2000, 'delay_days' => 1, 'position' => 2,
                'latitude' => 14.7397, 'longitude' => -17.4902, 'radius_km' => 6],
            ['name' => 'Banlieue — Pikine, Guédiawaye, Parcelles', 'city' => 'Dakar', 'fee' => 2500, 'delay_days' => 2, 'position' => 3,
                'latitude' => 14.7645, 'longitude' => -17.3906, 'radius_km' => 10],
            ['name' => 'Rufisque, Diamniadio, Bargny', 'city' => 'Rufisque', 'fee' => 3000, 'delay_days' => 2, 'position' => 4,
                'latitude' => 14.7167, 'longitude' => -17.2667, 'radius_km' => 15],
            ['name' => 'Thiès, Mbour, Saly', 'city' => 'Thiès', 'fee' => 4000, 'delay_days' => 3, 'position' => 5,
                'latitude' => 14.7833, 'longitude' => -16.9333, 'radius_km' => 45],
            ['name' => 'Autres régions', 'city' => null, 'fee' => 6000, 'delay_days' => 5, 'position' => 9,
                'note' => 'Livraison par transporteur'],
            ['name' => 'Retrait en boutique', 'city' => 'Dakar', 'fee' => 0, 'delay_days' => 1, 'position' => 0,
                'note' => 'Vous venez chercher votre colis'],
        ];

        foreach ($zones as $zone) {
            DeliveryZone::firstOrCreate(
                ['name' => $zone['name']],
                [...$zone, 'is_active' => true],
            );
        }
    }
}
