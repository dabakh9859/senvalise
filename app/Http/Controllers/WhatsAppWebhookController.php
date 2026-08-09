<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Message;
use App\Services\Messaging\WhatsAppCloudService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

/**
 * Ce que WhatsApp nous renvoie.
 *
 * Deux choses arrivent ici, et les deux comptent pour la survie du numéro :
 *
 * - **Les messages entrants.** Chacun ouvre une fenêtre de 24 heures pendant
 *   laquelle on peut répondre librement, sans modèle approuvé. Un message qui
 *   dit « stop » vaut désinscription, immédiatement et sans discussion : c'est
 *   la demande que Meta surveille le plus.
 * - **Les accusés de réception.** Remis, lu, échec. Un taux de lecture qui
 *   s'effondre annonce une note de qualité qui bascule ; le voir tôt permet
 *   d'arrêter une campagne avant que Meta ne coupe le numéro.
 *
 * L'adresse est publique — Meta ne peut pas s'authentifier — mais chaque appel
 * est vérifié par signature.
 */
class WhatsAppWebhookController extends Controller
{
    /** Mots qui valent désinscription, quelle que soit la casse ou la ponctuation. */
    private const STOP_WORDS = ['stop', 'arret', 'arrete', 'arrêt', 'arrêter', 'desabonner', 'désabonner', 'unsubscribe'];

    public function __construct(private readonly WhatsAppCloudService $cloud) {}

    /**
     * Vérification initiale de l'adresse par Meta.
     *
     * Meta appelle une fois avec un jeton et un défi ; il faut lui renvoyer le
     * défi tel quel pour prouver qu'on possède bien le serveur.
     */
    public function verify(Request $request): Response
    {
        $token = $this->cloud->verifyToken();

        if (
            blank($token)
            || $request->query('hub_mode') !== 'subscribe'
            || $request->query('hub_verify_token') !== $token
        ) {
            return response('Jeton de vérification invalide.', 403);
        }

        return response((string) $request->query('hub_challenge'), 200);
    }

    public function handle(Request $request): Response
    {
        if (! $this->cloud->signatureIsValid(
            $request->getContent(),
            $request->header('X-Hub-Signature-256'),
        )) {
            // 403 sans détail : inutile d'expliquer à un intrus ce qui a échoué.
            return response('', 403);
        }

        /** @var array<int, array<string, mixed>> $entries */
        $entries = $request->input('entry', []);

        foreach ($entries as $entry) {
            /** @var array<int, array<string, mixed>> $changes */
            $changes = is_array($entry['changes'] ?? null) ? $entry['changes'] : [];

            foreach ($changes as $change) {
                $value = is_array($change['value'] ?? null) ? $change['value'] : [];

                $this->handleInbound(is_array($value['messages'] ?? null) ? $value['messages'] : []);
                $this->handleStatuses(is_array($value['statuses'] ?? null) ? $value['statuses'] : []);
            }
        }

        // Toujours 200 : un code d'erreur pousse Meta à réessayer en boucle,
        // puis à désactiver le webhook.
        return response('', 200);
    }

    /*
    |--------------------------------------------------------------------------
    | Messages entrants
    |--------------------------------------------------------------------------
    */

    /** @param  array<int, array<string, mixed>>  $messages */
    protected function handleInbound(array $messages): void
    {
        foreach ($messages as $message) {
            $from = (string) ($message['from'] ?? '');

            if ($from === '') {
                continue;
            }

            $customer = $this->findByPhone($from);
            $text = $this->textOf($message);

            if ($customer) {
                // La fenêtre de service s'ouvre pour 24 h à partir de maintenant.
                $customer->forceFill(['whatsapp_last_inbound_at' => now()])->save();

                if ($this->isStopRequest($text)) {
                    $customer->forceFill(['whatsapp_opt_out_at' => now()])->save();

                    Log::info('WhatsApp : désinscription demandée', [
                        'customer_id' => $customer->id,
                    ]);
                }
            }

            if (filled($message['id'] ?? null)) {
                $this->cloud->markAsRead((string) $message['id']);
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Accusés de réception
    |--------------------------------------------------------------------------
    */

    /** @param  array<int, array<string, mixed>>  $statuses */
    protected function handleStatuses(array $statuses): void
    {
        foreach ($statuses as $status) {
            $id = (string) ($status['id'] ?? '');

            if ($id === '') {
                continue;
            }

            $message = Message::where('external_id', $id)->first();

            if (! $message) {
                continue;
            }

            match ((string) ($status['status'] ?? '')) {
                'delivered' => $message->markDelivered(),
                'read' => $message->markRead(),
                'failed' => $message->markFailed($this->failureReason($status)),
                default => null,
            };
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Assistants
    |--------------------------------------------------------------------------
    */

    /**
     * Retrouve le client par son numéro.
     *
     * WhatsApp renvoie « 221778858374 » ; en base, le numéro peut être écrit
     * « 77 885 83 74 ». On compare donc sur les derniers chiffres significatifs.
     */
    protected function findByPhone(string $phone): ?Customer
    {
        $digits = (string) preg_replace('/\D/', '', $phone);
        $tail = mb_substr($digits, -9);

        if ($tail === '') {
            return null;
        }

        return Customer::query()
            ->get(['id', 'phone', 'whatsapp_opt_in_at', 'whatsapp_opt_out_at', 'whatsapp_last_inbound_at'])
            ->first(function (Customer $customer) use ($tail): bool {
                $stored = (string) preg_replace('/\D/', '', (string) $customer->phone);

                return $stored !== '' && str_ends_with($stored, $tail);
            });
    }

    /** @param  array<string, mixed>  $message */
    protected function textOf(array $message): string
    {
        $text = is_array($message['text'] ?? null) ? $message['text'] : [];

        return (string) ($text['body'] ?? '');
    }

    protected function isStopRequest(string $text): bool
    {
        $normalised = mb_strtolower(trim($text));
        $normalised = (string) preg_replace('/[^\p{L}\s]/u', '', $normalised);

        return in_array($normalised, self::STOP_WORDS, true);
    }

    /** @param  array<string, mixed>  $status */
    protected function failureReason(array $status): string
    {
        $errors = is_array($status['errors'] ?? null) ? $status['errors'] : [];
        $first = is_array($errors[0] ?? null) ? $errors[0] : [];

        return (string) ($first['title'] ?? $first['message'] ?? 'Refusé par WhatsApp');
    }
}
