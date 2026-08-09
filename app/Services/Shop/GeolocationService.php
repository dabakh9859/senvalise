<?php

namespace App\Services\Shop;

use App\Models\DeliveryZone;

/**
 * Ce qu'on fait d'un point GPS.
 *
 * Deux usages, et un seul calcul : la distance à vol d'oiseau entre deux
 * points. Elle sert à proposer la bonne zone de livraison au client, et à
 * dire au livreur à quelle distance de la boutique il va.
 *
 * Aucun service extérieur n'est appelé. Envoyer la position d'un client à
 * Google ou à Mapbox pour retrouver un quartier reviendrait à la communiquer
 * à un tiers qu'il n'a pas choisi — le calcul tient en dix lignes, autant le
 * faire ici.
 */
class GeolocationService
{
    /** Rayon moyen de la Terre, en kilomètres. */
    private const EARTH_RADIUS_KM = 6371.0;

    /**
     * Au-delà, on ne propose plus rien.
     *
     * Un client à 400 km d'une zone n'est pas « presque dedans » : mieux vaut
     * le laisser choisir que lui suggérer une réponse fausse avec aplomb.
     */
    private const MAX_SUGGESTION_KM = 150.0;

    /** Les coordonnées sont-elles plausibles ? */
    public function isValid(?float $latitude, ?float $longitude): bool
    {
        if ($latitude === null || $longitude === null) {
            return false;
        }

        return $latitude >= -90 && $latitude <= 90
            && $longitude >= -180 && $longitude <= 180
            // (0, 0) tombe dans le golfe de Guinée : c'est presque toujours
            // une valeur non renseignée qui a fuité, pas une vraie position.
            && ! ($latitude === 0.0 && $longitude === 0.0);
    }

    /** Distance à vol d'oiseau, en kilomètres. */
    public function distance(
        float $fromLat,
        float $fromLng,
        float $toLat,
        float $toLng,
    ): float {
        $dLat = deg2rad($toLat - $fromLat);
        $dLng = deg2rad($toLng - $fromLng);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($fromLat)) * cos(deg2rad($toLat)) * sin($dLng / 2) ** 2;

        return self::EARTH_RADIUS_KM * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /**
     * La zone de livraison qui correspond le mieux à une position.
     *
     * On privilégie une zone qui couvre réellement le point (dans son rayon
     * déclaré) ; à défaut, la plus proche, et seulement si elle est à portée
     * raisonnable. Une suggestion fausse coûte plus cher qu'une absence de
     * suggestion : le client corrigerait sans comprendre pourquoi.
     *
     * @return array{zone: DeliveryZone, distance: float, covers: bool}|null
     */
    public function suggestZone(float $latitude, float $longitude): ?array
    {
        $candidates = DeliveryZone::active()
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->get();

        $best = null;

        foreach ($candidates as $zone) {
            $distance = $this->distance(
                $latitude,
                $longitude,
                (float) $zone->latitude,
                (float) $zone->longitude,
            );

            $covers = $zone->radius_km !== null && $distance <= $zone->radius_km;

            if ($best === null
                // Une zone qui couvre le point bat toujours une zone qui ne
                // fait que passer plus près.
                || ($covers && ! $best['covers'])
                || ($covers === $best['covers'] && $distance < $best['distance'])
            ) {
                $best = ['zone' => $zone, 'distance' => $distance, 'covers' => $covers];
            }
        }

        if ($best === null || (! $best['covers'] && $best['distance'] > self::MAX_SUGGESTION_KM)) {
            return null;
        }

        return $best;
    }

    /**
     * Lien vers une carte, pour le livreur.
     *
     * Le format « geo: » ouvre l'application de navigation installée sur le
     * téléphone ; les navigateurs de bureau, eux, ne le comprennent pas. On
     * passe donc par OpenStreetMap, qui marche partout et n'impose de compte
     * à personne.
     */
    public function mapUrl(float $latitude, float $longitude): string
    {
        return sprintf(
            'https://www.openstreetmap.org/?mlat=%1$s&mlon=%2$s#map=17/%1$s/%2$s',
            number_format($latitude, 6, '.', ''),
            number_format($longitude, 6, '.', ''),
        );
    }

    /** « à 12 m près » / « à 1,2 km près » — la précision, en clair. */
    public function accuracyLabel(?int $metres): ?string
    {
        if ($metres === null) {
            return null;
        }

        if ($metres < 1000) {
            return "à {$metres} m près";
        }

        return 'à '.str_replace('.', ',', (string) round($metres / 1000, 1)).' km près';
    }
}
