<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Setting;
use App\Services\ImageSearchService;
use App\Services\Messaging\MailSettings;
use App\Services\Messaging\WhatsAppCloudService;
use App\Services\Messaging\WhatsAppGateway;
use App\Services\Messaging\WhatsAppService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Services extérieurs branchés sur l'application.
 *
 * Les secrets (clés d'API, mots de passe) sont stockés chiffrés et ne sont
 * jamais renvoyés au navigateur : l'écran n'affiche que leur présence.
 */
class IntegrationSettingsController extends Controller
{
    public function __construct(
        private readonly ImageSearchService $search,
        private readonly MailSettings $mail,
        private readonly WhatsAppService $whatsapp,
        private readonly WhatsAppCloudService $cloud,
        private readonly WhatsAppGateway $gateway,
    ) {}

    public function edit(): Response
    {
        return Inertia::render('reglages/integrations', [
            'imageSearch' => [
                'configured' => $this->search->isConfigured(),
                'maskedKey' => $this->search->maskedKey(),
                'fromEnvironment' => blank(Setting::get(ImageSearchService::SETTING_KEY))
                    && filled(config('services.serpapi.key')),
            ],
            'mail' => [
                ...$this->mail->values(),
                'configured' => $this->mail->isConfigured(),
            ],
            'whatsapp' => [
                'driver' => $this->gateway->driver(),
                'countryCode' => $this->cloud->countryCode(),
                // API officielle de Meta : le mode recommandé.
                'cloud' => [
                    'phoneNumberId' => Setting::get(WhatsAppCloudService::PHONE_ID_KEY, ''),
                    'businessAccountId' => Setting::get(WhatsAppCloudService::WABA_KEY, ''),
                    'apiVersion' => $this->cloud->version(),
                    'hasToken' => filled(Setting::get(WhatsAppCloudService::TOKEN_KEY)),
                    'hasAppSecret' => $this->cloud->hasAppSecret(),
                    'hasVerifyToken' => filled($this->cloud->verifyToken()),
                    'configured' => $this->cloud->isConfigured(),
                    'webhookUrl' => route('webhooks.whatsapp'),
                    // Note de qualité et palier d'envoi, lus chez Meta à
                    // chaque affichage : c'est le tableau de bord qui prévient
                    // avant le bannissement.
                    'health' => $this->cloud->health(),
                    'templates' => $this->cloud->templates(),
                ],
                // Pont non officiel, conservé pour les essais.
                'waha' => [
                    'url' => Setting::get(WhatsAppService::URL_KEY, ''),
                    'session' => $this->whatsapp->session(),
                    'hasApiKey' => filled(Setting::get(WhatsAppService::SECRET_KEY)),
                    'configured' => $this->whatsapp->isConfigured(),
                    'status' => $this->whatsapp->isConfigured()
                        ? $this->whatsapp->status()
                        : null,
                ],
            ],
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Recherche d'images
    |--------------------------------------------------------------------------
    */

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'serpapi_key' => ['nullable', 'string', 'max:255'],
        ]);

        Setting::putSecret(
            ImageSearchService::SETTING_KEY,
            $validated['serpapi_key'] ?? null,
        );

        ActivityLog::record(
            'reglages',
            blank($validated['serpapi_key'] ?? null)
                ? 'Clé de recherche d’images retirée'
                : 'Clé de recherche d’images mise à jour',
        );

        $this->toast(
            blank($validated['serpapi_key'] ?? null)
                ? 'Clé retirée.'
                : 'Clé enregistrée.',
        );

        return back();
    }

    public function test(): RedirectResponse
    {
        try {
            $this->search->test();
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast('Connexion réussie : la recherche d’images fonctionne.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | E-mail
    |--------------------------------------------------------------------------
    */

    public function updateMail(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'mail_host' => ['nullable', 'string', 'max:180'],
            'mail_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'mail_username' => ['nullable', 'string', 'max:180'],
            'mail_password' => ['nullable', 'string', 'max:255'],
            'mail_encryption' => ['nullable', 'in:tls,ssl,none'],
            'mail_from_address' => ['nullable', 'email', 'max:180'],
            'mail_from_name' => ['nullable', 'string', 'max:120'],
        ]);

        foreach (MailSettings::KEYS as $key) {
            if (array_key_exists($key, $validated)) {
                Setting::put($key, (string) ($validated[$key] ?? ''));
            }
        }

        // Champ laissé vide = mot de passe conservé, comme partout ailleurs.
        if (filled($validated['mail_password'] ?? null)) {
            Setting::putSecret(MailSettings::SECRET_KEY, $validated['mail_password']);
        }

        ActivityLog::record('reglages', 'Réglages e-mail mis à jour');
        $this->toast('Réglages e-mail enregistrés.');

        return back();
    }

    /** Envoie un vrai message au gérant connecté : le seul test qui prouve. */
    public function testMail(Request $request): RedirectResponse
    {
        $recipient = $request->user()?->email;

        if (blank($recipient)) {
            $this->toast('Votre compte n’a pas d’adresse e-mail.', 'error');

            return back();
        }

        if (! $this->mail->isConfigured()) {
            $this->toast('Renseignez d’abord le serveur d’envoi.', 'error');

            return back();
        }

        try {
            $this->mail->apply();

            Mail::raw(
                "Ceci est un message de test envoyé depuis l'application SenValise.\n"
                ."Si vous le recevez, l'envoi d'e-mails est correctement configuré.",
                fn ($mailable) => $mailable
                    ->to($recipient, Auth::user()?->name)
                    ->subject('Test d’envoi — SenValise'),
            );
        } catch (Throwable $e) {
            $this->toast('Échec de l’envoi : '.$e->getMessage(), 'error');

            return back();
        }

        $this->toast("Message de test envoyé à {$recipient}.");

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | WhatsApp (WAHA)
    |--------------------------------------------------------------------------
    */

    /**
     * Réglages de l'API officielle.
     *
     * Les quatre secrets suivent la même règle que partout : un champ laissé
     * vide conserve la valeur enregistrée, et rien n'est jamais renvoyé au
     * navigateur. Le jeton d'accès en particulier permettrait d'envoyer des
     * messages au nom de la boutique.
     */
    public function updateWhatsappCloud(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'whatsapp_driver' => ['required', 'in:cloud,waha'],
            'whatsapp_phone_number_id' => ['nullable', 'string', 'regex:/^\d{5,25}$/'],
            'whatsapp_business_account_id' => ['nullable', 'string', 'regex:/^\d{5,25}$/'],
            'whatsapp_api_version' => ['nullable', 'string', 'regex:/^v\d+\.\d+$/'],
            'whatsapp_token' => ['nullable', 'string', 'max:1000'],
            'whatsapp_app_secret' => ['nullable', 'string', 'max:255'],
            'whatsapp_verify_token' => ['nullable', 'string', 'max:255'],
            'phone_country_code' => ['nullable', 'string', 'regex:/^\d{1,4}$/'],
        ], [
            'whatsapp_phone_number_id.regex' => 'L’identifiant du numéro ne contient que des chiffres.',
            'whatsapp_business_account_id.regex' => 'L’identifiant du compte ne contient que des chiffres.',
            'whatsapp_api_version.regex' => 'La version s’écrit sous la forme « v23.0 ».',
            'phone_country_code.regex' => 'L’indicatif doit être composé de 1 à 4 chiffres (221 pour le Sénégal).',
        ]);

        Setting::put(WhatsAppGateway::DRIVER_KEY, $validated['whatsapp_driver']);
        Setting::put(WhatsAppCloudService::PHONE_ID_KEY, (string) ($validated['whatsapp_phone_number_id'] ?? ''));
        Setting::put(WhatsAppCloudService::WABA_KEY, (string) ($validated['whatsapp_business_account_id'] ?? ''));
        Setting::put(WhatsAppCloudService::VERSION_KEY, (string) ($validated['whatsapp_api_version'] ?? WhatsAppCloudService::DEFAULT_VERSION));
        Setting::put(WhatsAppCloudService::COUNTRY_KEY, (string) ($validated['phone_country_code'] ?? '221'));

        foreach ([
            WhatsAppCloudService::TOKEN_KEY => 'whatsapp_token',
            WhatsAppCloudService::APP_SECRET_KEY => 'whatsapp_app_secret',
            WhatsAppCloudService::VERIFY_TOKEN_KEY => 'whatsapp_verify_token',
        ] as $key => $field) {
            if (filled($validated[$field] ?? null)) {
                Setting::putSecret($key, $validated[$field]);
            }
        }

        ActivityLog::record('reglages', 'Réglages WhatsApp Cloud API mis à jour');
        $this->toast('Réglages WhatsApp enregistrés.');

        return back();
    }

    /** Interroge Meta : nom vérifié, note de qualité, palier d'envoi. */
    public function testWhatsappCloud(): RedirectResponse
    {
        if (! $this->cloud->isConfigured()) {
            $this->toast('Renseignez d’abord l’identifiant du numéro et le jeton.', 'error');

            return back();
        }

        $health = $this->cloud->health();

        if ($health['error'] !== null) {
            $this->toast('Échec : '.$health['error'], 'error');

            return back();
        }

        $this->toast(
            "Connecté à « {$health['name']} » ({$health['number']}). "
            ."Qualité : {$health['qualityLabel']}. Limite : {$health['tierLabel']}.",
            $health['quality'] === 'RED' ? 'warning' : 'success',
        );

        return back();
    }

    public function updateWhatsapp(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'waha_url' => ['nullable', 'url:http,https', 'max:255'],
            'waha_api_key' => ['nullable', 'string', 'max:255'],
            'waha_session' => ['nullable', 'string', 'max:60'],
            'phone_country_code' => ['nullable', 'string', 'regex:/^\d{1,4}$/'],
        ], [
            'phone_country_code.regex' => 'L’indicatif doit être composé de 1 à 4 chiffres (221 pour le Sénégal).',
        ]);

        Setting::put(WhatsAppService::URL_KEY, (string) ($validated['waha_url'] ?? ''));
        Setting::put(WhatsAppService::SESSION_KEY, (string) ($validated['waha_session'] ?? 'default'));
        Setting::put(WhatsAppService::COUNTRY_KEY, (string) ($validated['phone_country_code'] ?? '221'));

        if (filled($validated['waha_api_key'] ?? null)) {
            Setting::putSecret(WhatsAppService::SECRET_KEY, $validated['waha_api_key']);
        }

        ActivityLog::record('reglages', 'Réglages WhatsApp mis à jour');
        $this->toast('Réglages WhatsApp enregistrés.');

        return back();
    }

    public function startWhatsapp(): RedirectResponse
    {
        try {
            $this->whatsapp->startSession();
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast('Session démarrée. Le QR code apparaît dans quelques secondes.');

        return back();
    }

    public function stopWhatsapp(): RedirectResponse
    {
        try {
            $this->whatsapp->stopSession();
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast('Session WhatsApp arrêtée.');

        return back();
    }

    /** État + QR code, interrogés en direct par l'écran des réglages. */
    public function whatsappStatus(): JsonResponse
    {
        if (! $this->whatsapp->isConfigured()) {
            return response()->json(['configured' => false]);
        }

        $status = $this->whatsapp->status();

        return response()->json([
            'configured' => true,
            ...$status,
            'qr' => $status['status'] === 'SCAN_QR_CODE'
                ? $this->whatsapp->qrCode()
                : null,
        ]);
    }
}
