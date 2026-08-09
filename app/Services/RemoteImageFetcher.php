<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Psr\Http\Message\StreamInterface;
use Psr\Http\Message\UriInterface;
use RuntimeException;
use Throwable;

/**
 * Télécharge une image depuis une adresse extérieure.
 *
 * Faire récupérer une URL quelconque par le serveur est une porte d'entrée
 * classique (SSRF) : sans contrôle, on pourrait lui faire interroger des
 * adresses du réseau local ou des services internes. D'où les garde-fous ci-
 * dessous — schéma autorisé, adresse publique vérifiée à chaque redirection,
 * taille et durée plafonnées, et contenu vérifié comme étant bien une image.
 */
class RemoteImageFetcher
{
    public const MAX_BYTES = 15 * 1024 * 1024;

    public const TIMEOUT = 20;

    public const MAX_REDIRECTS = 3;

    /** @return string Le contenu binaire de l'image. */
    public function fetch(string $url): string
    {
        $parts = parse_url($url);

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            throw new RuntimeException('Adresse d’image invalide.');
        }

        if (! in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
            throw new RuntimeException('Seules les adresses http et https sont acceptées.');
        }

        $this->assertPublicHost($parts['host']);

        try {
            $response = Http::withOptions([
                'stream' => true,
                'allow_redirects' => [
                    'max' => self::MAX_REDIRECTS,
                    'strict' => true,
                    'referer' => false,
                    'protocols' => ['http', 'https'],
                    // Une redirection peut viser une adresse interne : on
                    // revérifie chaque étape.
                    'on_redirect' => function ($request, $response, UriInterface $uri): void {
                        $this->assertPublicHost($uri->getHost());
                    },
                ],
            ])
                ->timeout(self::TIMEOUT)
                ->withHeaders(['Accept' => 'image/*'])
                ->get($url);
        } catch (RuntimeException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new RuntimeException('Image inaccessible : '.$e->getMessage(), previous: $e);
        }

        if ($response->failed()) {
            throw new RuntimeException("L'image n'a pas pu être téléchargée (code {$response->status()}).");
        }

        $data = $this->readCapped($response->toPsrResponse()->getBody());

        if ($data === '') {
            throw new RuntimeException('Le fichier téléchargé est vide.');
        }

        // On ne se fie pas à l'en-tête annoncé : c'est le contenu qui décide.
        if (getimagesizefromstring($data) === false) {
            throw new RuntimeException("Le fichier téléchargé n'est pas une image valide.");
        }

        return $data;
    }

    /** Lit le flux par blocs et coupe dès que le plafond est franchi. */
    protected function readCapped(StreamInterface $stream): string
    {
        $data = '';

        while (! $stream->eof()) {
            $data .= $stream->read(64 * 1024);

            if (strlen($data) > self::MAX_BYTES) {
                throw new RuntimeException('Image trop lourde : 15 Mo maximum.');
            }
        }

        return $data;
    }

    /**
     * Refuse tout ce qui pointe vers la machine elle-même ou le réseau privé.
     */
    protected function assertPublicHost(string $host): void
    {
        foreach ($this->resolve($host) as $ip) {
            $public = filter_var(
                $ip,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
            );

            if ($public === false) {
                throw new RuntimeException('Cette adresse pointe vers le réseau interne.');
            }
        }
    }

    /** @return array<int, string> */
    protected function resolve(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return [$host];
        }

        $ips = gethostbynamel($host) ?: [];

        $v6 = @dns_get_record($host, DNS_AAAA) ?: [];

        foreach ($v6 as $record) {
            if (isset($record['ipv6'])) {
                $ips[] = $record['ipv6'];
            }
        }

        if ($ips === []) {
            throw new RuntimeException("Le nom de domaine « {$host} » est introuvable.");
        }

        return $ips;
    }
}
