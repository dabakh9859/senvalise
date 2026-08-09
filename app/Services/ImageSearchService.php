<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * Recherche d'images produit via SerpAPI (moteur Google Images).
 *
 * L'appel part toujours du serveur : la clé d'API ne transite jamais par le
 * navigateur. Elle se règle depuis Réglages → Intégrations et retombe sur la
 * variable d'environnement si elle n'y est pas.
 */
class ImageSearchService
{
    public const SETTING_KEY = 'serpapi_key';

    public const MAX_RESULTS = 30;

    public function isConfigured(): bool
    {
        return filled($this->apiKey());
    }

    public function apiKey(): ?string
    {
        $stored = Setting::get(self::SETTING_KEY);

        return filled($stored)
            ? (string) $stored
            : (config('services.serpapi.key') ?: null);
    }

    /** Les quatre derniers caractères suffisent à reconnaître la clé en place. */
    public function maskedKey(): ?string
    {
        $key = $this->apiKey();

        if (blank($key)) {
            return null;
        }

        return str_repeat('•', 8).substr($key, -4);
    }

    /**
     * @return array<int, array<string, mixed>>
     *
     * @throws RuntimeException
     */
    public function search(string $query, int $limit = 24): array
    {
        $key = $this->apiKey();

        if (blank($key)) {
            throw new RuntimeException(
                "Aucune clé SerpAPI n'est enregistrée. Renseignez-la dans Réglages → Intégrations.",
            );
        }

        try {
            $response = Http::timeout(15)
                ->retry(2, 300, throw: false)
                ->get((string) config('services.serpapi.endpoint'), [
                    'engine' => 'google_images',
                    'q' => $query,
                    'api_key' => $key,
                    'hl' => 'fr',
                    'gl' => 'sn',
                    'safe' => 'active',
                    'num' => min($limit, self::MAX_RESULTS),
                ]);
        } catch (Throwable $e) {
            throw new RuntimeException(
                'Impossible de joindre le service de recherche. Vérifiez la connexion internet.',
                previous: $e,
            );
        }

        if ($response->status() === 401) {
            throw new RuntimeException('Clé SerpAPI refusée. Vérifiez-la dans Réglages → Intégrations.');
        }

        if ($response->failed()) {
            throw new RuntimeException(
                (string) ($response->json('error') ?: 'La recherche d’images a échoué.'),
            );
        }

        if ($response->json('error')) {
            throw new RuntimeException((string) $response->json('error'));
        }

        $rows = $response->json('images_results');

        if (! is_array($rows)) {
            return [];
        }

        $results = [];

        foreach ($rows as $row) {
            // Sans adresse d'origine, l'image ne peut pas être reprise.
            if (! is_array($row) || blank($row['original'] ?? null)) {
                continue;
            }

            $original = (string) $row['original'];

            $results[] = [
                'id' => count($results),
                'url' => $original,
                'thumbnail' => (string) ($row['thumbnail'] ?? $original),
                'title' => (string) ($row['title'] ?? ''),
                'source' => (string) ($row['source'] ?? parse_url($original, PHP_URL_HOST) ?: ''),
                'sourceLink' => (string) ($row['link'] ?? ''),
                'width' => (int) ($row['original_width'] ?? 0),
                'height' => (int) ($row['original_height'] ?? 0),
            ];

            if (count($results) >= $limit) {
                break;
            }
        }

        return $results;
    }

    /** Appel minimal pour vérifier qu'une clé fonctionne. */
    public function test(): bool
    {
        $this->search('valise', 1);

        return true;
    }
}
