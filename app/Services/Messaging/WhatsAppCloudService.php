<?php

namespace App\Services\Messaging;

use App\Models\Setting;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * WhatsApp par l'API officielle de Meta (Cloud API).
 *
 * C'est la seule voie autorisée pour envoyer des messages professionnels.
 * L'autre approche — piloter un compte WhatsApp ordinaire via un pont qui
 * imite WhatsApp Web — viole les conditions d'utilisation : Meta bannit le
 * numéro, souvent sans avertissement et sans recours. Voir [WhatsAppService]
 * pour ce mode hérité, conservé pour les essais mais déconseillé en boutique.
 *
 * Deux règles structurent tout le reste :
 *
 * 1. Hors fenêtre de service, on ne peut envoyer qu'un **modèle approuvé** par
 *    Meta. Un texte libre est refusé par l'API (erreur 131047).
 * 2. La **fenêtre de service** s'ouvre pour 24 heures quand le client écrit à
 *    la boutique. Pendant ce laps de temps, le texte libre passe.
 *
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
 */
class WhatsAppCloudService
{
    public const PHONE_ID_KEY = 'whatsapp_phone_number_id';

    public const WABA_KEY = 'whatsapp_business_account_id';

    public const TOKEN_KEY = 'whatsapp_token';

    public const APP_SECRET_KEY = 'whatsapp_app_secret';

    public const VERIFY_TOKEN_KEY = 'whatsapp_verify_token';

    public const VERSION_KEY = 'whatsapp_api_version';

    public const COUNTRY_KEY = 'phone_country_code';

    public const DEFAULT_VERSION = 'v23.0';

    public function isConfigured(): bool
    {
        return filled($this->phoneNumberId()) && filled($this->token());
    }

    public function phoneNumberId(): ?string
    {
        $value = Setting::get(self::PHONE_ID_KEY);

        return filled($value) ? (string) $value : null;
    }

    public function businessAccountId(): ?string
    {
        $value = Setting::get(self::WABA_KEY);

        return filled($value) ? (string) $value : null;
    }

    public function version(): string
    {
        $value = Setting::get(self::VERSION_KEY);

        return filled($value) ? (string) $value : self::DEFAULT_VERSION;
    }

    /** Indicatif ajouté aux numéros saisis sans indicatif (221 = Sénégal). */
    public function countryCode(): string
    {
        $code = Setting::get(self::COUNTRY_KEY);

        return filled($code) ? (string) preg_replace('/\D/', '', (string) $code) : '221';
    }

    /*
    |--------------------------------------------------------------------------
    | Envoi
    |--------------------------------------------------------------------------
    */

    /**
     * Envoie un modèle approuvé. C'est le seul envoi possible hors fenêtre.
     *
     * @param  array<int, string>  $parameters  Variables du corps, dans l'ordre.
     * @return string Identifiant du message chez Meta, pour suivre son statut.
     */
    public function sendTemplate(
        string $phone,
        string $template,
        string $language = 'fr',
        array $parameters = [],
    ): string {
        $payload = [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => $this->normalise($phone),
            'type' => 'template',
            'template' => [
                'name' => $template,
                'language' => ['code' => $language],
            ],
        ];

        if ($parameters !== []) {
            $payload['template']['components'] = [[
                'type' => 'body',
                'parameters' => array_map(
                    fn (string $value) => ['type' => 'text', 'text' => $value],
                    array_values($parameters),
                ),
            ]];
        }

        return $this->post($payload);
    }

    /**
     * Texte libre. À n'utiliser que dans la fenêtre de 24 heures ouverte par
     * le client : en dehors, Meta refuse et l'échec pèse sur la réputation.
     *
     * @return string Identifiant du message chez Meta.
     */
    public function sendText(string $phone, string $body): string
    {
        return $this->post([
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => $this->normalise($phone),
            'type' => 'text',
            'text' => ['preview_url' => false, 'body' => $body],
        ]);
    }

    /**
     * Marque un message entrant comme lu.
     *
     * Ce n'est pas de la courtoisie : les doubles coches bleues font partie de
     * ce que Meta observe pour juger qu'une conversation est réelle.
     */
    public function markAsRead(string $messageId): void
    {
        try {
            $this->client()->post("/{$this->phoneNumberId()}/messages", [
                'messaging_product' => 'whatsapp',
                'status' => 'read',
                'message_id' => $messageId,
            ]);
        } catch (Throwable) {
            // Sans conséquence sur l'envoi : on n'interrompt rien pour ça.
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Santé du numéro
    |--------------------------------------------------------------------------
    */

    /**
     * Note de qualité et palier d'envoi, tels que Meta les voit.
     *
     * C'est le tableau de bord anti-bannissement : la note passe au jaune puis
     * au rouge quand les clients bloquent ou signalent, et le palier gèle ou
     * retombe dans la foulée.
     *
     * @return array{configured: bool, name: string|null, number: string|null, quality: string|null, qualityLabel: string, tier: string|null, tierLabel: string, error: string|null}
     */
    public function health(): array
    {
        $empty = [
            'configured' => false,
            'name' => null,
            'number' => null,
            'quality' => null,
            'qualityLabel' => 'Inconnue',
            'tier' => null,
            'tierLabel' => 'Inconnu',
            'error' => null,
        ];

        if (! $this->isConfigured()) {
            return $empty;
        }

        try {
            $response = $this->client()->get("/{$this->phoneNumberId()}", [
                'fields' => 'verified_name,display_phone_number,quality_rating,messaging_limit_tier',
            ]);
        } catch (Throwable $e) {
            return [...$empty, 'configured' => true, 'error' => $e->getMessage()];
        }

        if ($response->failed()) {
            return [...$empty, 'configured' => true, 'error' => $this->errorMessage($response->json())];
        }

        $quality = $response->json('quality_rating');
        $tier = $response->json('messaging_limit_tier');

        return [
            'configured' => true,
            'name' => $response->json('verified_name'),
            'number' => $response->json('display_phone_number'),
            'quality' => is_string($quality) ? $quality : null,
            'qualityLabel' => $this->qualityLabel(is_string($quality) ? $quality : null),
            'tier' => is_string($tier) ? $tier : null,
            'tierLabel' => $this->tierLabel(is_string($tier) ? $tier : null),
            'error' => null,
        ];
    }

    /**
     * Modèles déclarés sur le compte, avec leur état d'approbation.
     *
     * @return array<int, array{name: string, language: string, status: string, category: string, body: string}>
     */
    public function templates(): array
    {
        if (! $this->isConfigured() || blank($this->businessAccountId())) {
            return [];
        }

        try {
            $response = $this->client()->get("/{$this->businessAccountId()}/message_templates", [
                'fields' => 'name,status,category,language,components',
                'limit' => 100,
            ]);
        } catch (Throwable) {
            return [];
        }

        if ($response->failed()) {
            return [];
        }

        /** @var array<int, array<string, mixed>> $data */
        $data = $response->json('data') ?? [];

        return array_map(fn (array $row): array => [
            'name' => (string) ($row['name'] ?? ''),
            'language' => (string) ($row['language'] ?? ''),
            'status' => (string) ($row['status'] ?? ''),
            'category' => (string) ($row['category'] ?? ''),
            'body' => $this->bodyOf($row),
        ], $data);
    }

    /*
    |--------------------------------------------------------------------------
    | Numéros
    |--------------------------------------------------------------------------
    */

    /**
     * « 77 885 83 74 » → « 221778858374 ».
     * L'API veut le numéro complet, sans « + » ni séparateur.
     */
    public function normalise(string $phone): string
    {
        $digits = (string) preg_replace('/\D/', '', $phone);

        if ($digits === '') {
            throw new RuntimeException('Numéro de téléphone vide.');
        }

        $digits = ltrim($digits, '0');
        $country = $this->countryCode();

        return str_starts_with($digits, $country) ? $digits : $country.$digits;
    }

    /*
    |--------------------------------------------------------------------------
    | Webhook
    |--------------------------------------------------------------------------
    */

    public function verifyToken(): ?string
    {
        $value = Setting::get(self::VERIFY_TOKEN_KEY);

        return filled($value) ? (string) $value : null;
    }

    /**
     * Vérifie la signature d'un appel de webhook.
     *
     * Sans cette vérification, n'importe qui connaissant l'adresse pourrait
     * inventer des accusés de réception ou des messages entrants — et donc
     * ouvrir de fausses fenêtres de 24 heures.
     */
    public function signatureIsValid(string $payload, ?string $header): bool
    {
        $secret = Setting::get(self::APP_SECRET_KEY);

        if (blank($secret) || blank($header)) {
            return false;
        }

        $expected = 'sha256='.hash_hmac('sha256', $payload, (string) $secret);

        return hash_equals($expected, (string) $header);
    }

    public function hasAppSecret(): bool
    {
        return filled(Setting::get(self::APP_SECRET_KEY));
    }

    /*
    |--------------------------------------------------------------------------
    | Interne
    |--------------------------------------------------------------------------
    */

    /** @param  array<string, mixed>  $payload */
    protected function post(array $payload): string
    {
        $this->assertConfigured();

        $response = $this->client()->post("/{$this->phoneNumberId()}/messages", $payload);

        if ($response->failed()) {
            throw new RuntimeException($this->errorMessage($response->json()));
        }

        return (string) ($response->json('messages.0.id') ?? '');
    }

    protected function client(): PendingRequest
    {
        return Http::baseUrl('https://graph.facebook.com/'.$this->version())
            ->withToken((string) $this->token())
            ->timeout(20)
            ->acceptJson();
    }

    protected function token(): ?string
    {
        $value = Setting::get(self::TOKEN_KEY);

        return filled($value) ? (string) $value : null;
    }

    protected function assertConfigured(): void
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException(
                'WhatsApp n’est pas configuré. Renseignez l’identifiant du numéro et le jeton dans Réglages → Intégrations.',
            );
        }
    }

    /** Traduit les codes d'erreur de Meta en phrases utiles au gérant. */
    protected function errorMessage(mixed $json): string
    {
        $error = is_array($json) && is_array($json['error'] ?? null) ? $json['error'] : [];
        $code = (int) ($error['code'] ?? 0);
        $detail = (string) ($error['message'] ?? 'réponse inattendue de WhatsApp');

        return match ($code) {
            131047 => 'Fenêtre de 24 h fermée : ce client n’a pas écrit récemment, il faut passer par un modèle approuvé.',
            131026 => 'Ce numéro n’a pas de compte WhatsApp, ou ne peut pas recevoir de message.',
            131049 => 'Meta a bloqué cet envoi pour préserver l’expérience du destinataire (trop de messages marketing reçus récemment).',
            132000, 132001 => 'Modèle introuvable ou pas encore approuvé par Meta.',
            132015 => 'Ce modèle a été suspendu par Meta après des retours négatifs.',
            190 => 'Le jeton d’accès a expiré. Générez un jeton permanent depuis un utilisateur système.',
            80007, 130429 => 'Limite d’envoi atteinte pour aujourd’hui. Réessayez plus tard.',
            default => $detail,
        };
    }

    protected function qualityLabel(?string $quality): string
    {
        return match ($quality) {
            'GREEN' => 'Bonne',
            'YELLOW' => 'Moyenne — attention',
            'RED' => 'Mauvaise — envois menacés',
            'UNKNOWN' => 'Pas encore évaluée',
            default => 'Inconnue',
        };
    }

    protected function tierLabel(?string $tier): string
    {
        return match ($tier) {
            'TIER_50' => '50 clients par jour',
            'TIER_250' => '250 clients par jour',
            'TIER_1K' => '1 000 clients par jour',
            'TIER_10K' => '10 000 clients par jour',
            'TIER_100K' => '100 000 clients par jour',
            'TIER_UNLIMITED' => 'Sans limite',
            default => 'Inconnu',
        };
    }

    /** @param  array<string, mixed>  $template */
    protected function bodyOf(array $template): string
    {
        $components = is_array($template['components'] ?? null) ? $template['components'] : [];

        foreach ($components as $component) {
            if (is_array($component) && ($component['type'] ?? null) === 'BODY') {
                return (string) ($component['text'] ?? '');
            }
        }

        return '';
    }
}
