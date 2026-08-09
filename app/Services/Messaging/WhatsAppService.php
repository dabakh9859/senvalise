<?php

namespace App\Services\Messaging;

use App\Models\Setting;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * WhatsApp via WAHA (WhatsApp HTTP API), auto-hébergé.
 *
 * WAHA pilote un vrai compte WhatsApp : il faut donc scanner un QR code depuis
 * le téléphone de la boutique, comme pour WhatsApp Web. La session reste
 * ouverte tant que le téléphone n'est pas déconnecté.
 */
class WhatsAppService
{
    public const URL_KEY = 'waha_url';

    public const SECRET_KEY = 'waha_api_key';

    public const SESSION_KEY = 'waha_session';

    public const COUNTRY_KEY = 'phone_country_code';

    public function isConfigured(): bool
    {
        return filled($this->baseUrl());
    }

    public function baseUrl(): ?string
    {
        $url = Setting::get(self::URL_KEY);

        return filled($url) ? rtrim((string) $url, '/') : null;
    }

    public function session(): string
    {
        $session = Setting::get(self::SESSION_KEY);

        return filled($session) ? (string) $session : 'default';
    }

    /** Indicatif ajouté aux numéros saisis sans indicatif (221 = Sénégal). */
    public function countryCode(): string
    {
        $code = Setting::get(self::COUNTRY_KEY);

        return filled($code) ? preg_replace('/\D/', '', (string) $code) : '221';
    }

    /**
     * État de la session : c'est lui qui dit s'il faut scanner un QR code.
     *
     * @return array{connected: bool, status: string, label: string, detail: string|null}
     */
    public function status(): array
    {
        if (! $this->isConfigured()) {
            return [
                'connected' => false,
                'status' => 'NON_CONFIGURE',
                'label' => 'Non configuré',
                'detail' => "Renseignez l'adresse du serveur WAHA.",
            ];
        }

        try {
            $response = $this->client()->get("/api/sessions/{$this->session()}");
        } catch (Throwable $e) {
            return [
                'connected' => false,
                'status' => 'INJOIGNABLE',
                'label' => 'Serveur injoignable',
                'detail' => $e->getMessage(),
            ];
        }

        if ($response->status() === 404) {
            return [
                'connected' => false,
                'status' => 'STOPPED',
                'label' => 'Session arrêtée',
                'detail' => 'Démarrez la session pour obtenir un QR code.',
            ];
        }

        if ($response->failed()) {
            return [
                'connected' => false,
                'status' => 'ERREUR',
                'label' => 'Erreur',
                'detail' => "Le serveur a répondu {$response->status()}.",
            ];
        }

        $status = (string) ($response->json('status') ?? 'INCONNU');

        return [
            'connected' => $status === 'WORKING',
            'status' => $status,
            'label' => $this->statusLabel($status),
            'detail' => $status === 'SCAN_QR_CODE'
                ? 'Scannez le QR code depuis WhatsApp sur le téléphone de la boutique.'
                : null,
        ];
    }

    /** Démarre la session pour faire apparaître le QR code. */
    public function startSession(): void
    {
        $this->assertConfigured();

        $response = $this->client()->post('/api/sessions/start', [
            'name' => $this->session(),
        ]);

        // 422 = session déjà démarrée : ce n'est pas une erreur pour le gérant.
        if ($response->failed() && $response->status() !== 422) {
            throw new RuntimeException("Impossible de démarrer la session (code {$response->status()}).");
        }
    }

    public function stopSession(): void
    {
        $this->assertConfigured();

        $this->client()->post('/api/sessions/stop', ['name' => $this->session()]);
    }

    /** QR code encodé en data URI, prêt à afficher. */
    public function qrCode(): ?string
    {
        $this->assertConfigured();

        try {
            $response = $this->client()
                ->withHeaders(['Accept' => 'image/png'])
                ->get("/api/{$this->session()}/auth/qr", ['format' => 'image']);
        } catch (Throwable) {
            return null;
        }

        if ($response->failed()) {
            return null;
        }

        return 'data:image/png;base64,'.base64_encode($response->body());
    }

    public function send(string $phone, string $text): void
    {
        $this->assertConfigured();

        $response = $this->client()->post('/api/sendText', [
            'session' => $this->session(),
            'chatId' => $this->chatId($phone),
            'text' => $text,
        ]);

        if ($response->failed()) {
            throw new RuntimeException(
                'WhatsApp a refusé l’envoi : '
                .($response->json('message') ?: "code {$response->status()}"),
            );
        }
    }

    /**
     * « 77 885 83 74 » → « 221778858374@c.us ».
     * Un numéro déjà en format international est conservé tel quel.
     */
    public function chatId(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if ($digits === '') {
            throw new RuntimeException('Numéro de téléphone vide.');
        }

        $digits = ltrim($digits, '0');
        $country = $this->countryCode();

        if (! str_starts_with($digits, $country)) {
            $digits = $country.$digits;
        }

        return $digits.'@c.us';
    }

    protected function client(): PendingRequest
    {
        $request = Http::baseUrl((string) $this->baseUrl())
            ->timeout(20)
            ->acceptJson();

        $key = Setting::get(self::SECRET_KEY);

        return filled($key)
            ? $request->withHeaders(['X-Api-Key' => (string) $key])
            : $request;
    }

    protected function assertConfigured(): void
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException(
                "WhatsApp n'est pas configuré. Renseignez l'adresse du serveur WAHA dans Réglages → Intégrations.",
            );
        }
    }

    protected function statusLabel(string $status): string
    {
        return match ($status) {
            'WORKING' => 'Connecté',
            'SCAN_QR_CODE' => 'QR code à scanner',
            'STARTING' => 'Démarrage en cours',
            'STOPPED' => 'Session arrêtée',
            'FAILED' => 'Échec de connexion',
            default => $status,
        };
    }
}
