<?php

namespace App\Services\Messaging;

use App\Enums\MessageChannel;
use App\Enums\MessageStatus;
use App\Enums\MessageType;
use App\Jobs\SendMessageJob;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Message;
use App\Models\MessageTemplate;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Préparation et mise en file des messages.
 *
 * L'envoi lui-même passe par la file d'attente : une campagne de 200 clients
 * ne doit pas bloquer l'écran du gérant, et un échec sur un destinataire ne
 * doit pas emporter les autres.
 *
 * C'est aussi ici que se joue la survie du numéro WhatsApp. Trois refus de
 * partir valent mieux qu'un envoi que Meta comptera contre nous :
 * pas de consentement, pas de message ; pas de modèle approuvé hors fenêtre
 * de service, pas de message ; et jamais deux cents envois d'un coup.
 */
class MessageService
{
    /**
     * Espacement entre deux envois d'une même campagne.
     *
     * Meta observe la vitesse autant que le volume : deux cents messages en
     * dix secondes ressemblent à du spam, les mêmes étalés sur vingt minutes
     * ressemblent à une boutique qui travaille. Six secondes donnent 600
     * messages à l'heure, très au-dessus des besoins d'une boutique.
     */
    public const SPACING_SECONDS = 6;

    public function __construct(
        private readonly MessageComposer $composer,
        private readonly WhatsAppGateway $whatsapp,
    ) {}

    /**
     * Prépare un envoi pour chaque destinataire et le met en file.
     *
     * @param  array<int, Customer>  $customers
     * @param  array<int, int>  $documentIds  Document rattaché, par client (rappels).
     * @return array{queued: int, skipped: array<int, string>}
     */
    public function queue(
        MessageType $type,
        MessageChannel $channel,
        string $body,
        ?string $subject,
        array $customers,
        ?MessageTemplate $template = null,
        ?string $label = null,
        array $documentIds = [],
        ?string $whatsappTemplate = null,
        string $whatsappLanguage = 'fr',
    ): array {
        $batchId = (string) Str::uuid();
        $skipped = [];
        $queued = 0;

        DB::transaction(function () use (
            $type, $channel, $body, $subject, $customers, $template, $label,
            $documentIds, $batchId, $whatsappTemplate, $whatsappLanguage,
            &$skipped, &$queued
        ) {
            foreach ($customers as $customer) {
                $refusal = $this->refusalReason(
                    $customer,
                    $channel,
                    $type,
                    $whatsappTemplate,
                );

                if ($refusal !== null) {
                    $skipped[] = $refusal;

                    continue;
                }

                $document = isset($documentIds[$customer->id])
                    ? Document::whereKey((int) $documentIds[$customer->id])->first()
                    : null;

                $message = Message::create([
                    'message_template_id' => $template?->id,
                    'customer_id' => $customer->id,
                    'document_id' => $document?->id,
                    'type' => $type->value,
                    'channel' => $channel->value,
                    'recipient' => (string) $this->recipientFor($customer, $channel),
                    'recipient_name' => $customer->displayName(),
                    'subject' => $subject
                        ? $this->composer->render($subject, $customer, $document)
                        : null,
                    'body' => $this->composer->render($body, $customer, $document),
                    'status' => MessageStatus::EnAttente->value,
                    'template_name' => $channel === MessageChannel::Whatsapp
                        ? $whatsappTemplate
                        : null,
                    'batch_id' => $batchId,
                    'batch_label' => $label,
                    'user_id' => Auth::id(),
                ]);

                // Chaque message part un peu après le précédent : c'est le
                // rythme, pas seulement le nombre, que Meta surveille.
                SendMessageJob::dispatch($message->id, $whatsappLanguage)
                    ->delay(now()->addSeconds($queued * self::SPACING_SECONDS));

                $queued++;
            }
        });

        return ['queued' => $queued, 'skipped' => $skipped];
    }

    /** Remet en file un message qui a échoué. */
    public function retry(Message $message): void
    {
        $message->forceFill([
            'status' => MessageStatus::EnAttente->value,
            'error' => null,
        ])->save();

        SendMessageJob::dispatch($message->id);
    }

    /**
     * Combien de clients recevront réellement ce message, et pourquoi les
     * autres seront écartés — pour l'afficher avant d'envoyer.
     *
     * @param  array<int, Customer>  $customers
     * @return array{eligible: int, reasons: array<string, int>}
     */
    public function preview(
        MessageType $type,
        MessageChannel $channel,
        array $customers,
        ?string $whatsappTemplate = null,
    ): array {
        $eligible = 0;
        $reasons = [];

        foreach ($customers as $customer) {
            $refusal = $this->refusalReason($customer, $channel, $type, $whatsappTemplate);

            if ($refusal === null) {
                $eligible++;

                continue;
            }

            // On regroupe par motif : « 12 clients sans consentement » se lit
            // mieux que douze lignes presque identiques.
            $key = $this->reasonKey($customer, $channel, $type, $whatsappTemplate);
            $reasons[$key] = ($reasons[$key] ?? 0) + 1;
        }

        return ['eligible' => $eligible, 'reasons' => $reasons];
    }

    /*
    |--------------------------------------------------------------------------
    | Garde-fous
    |--------------------------------------------------------------------------
    */

    /**
     * Pourquoi ce client ne recevra pas le message — null s'il le recevra.
     *
     * L'ordre compte : on annonce d'abord ce que le gérant peut corriger
     * (une coordonnée manquante) avant ce qui relève du client (son refus).
     */
    protected function refusalReason(
        Customer $customer,
        MessageChannel $channel,
        MessageType $type,
        ?string $whatsappTemplate,
    ): ?string {
        $name = $customer->displayName();

        if (blank($this->recipientFor($customer, $channel))) {
            return $channel === MessageChannel::Email
                ? "{$name} n’a pas d’adresse e-mail"
                : "{$name} n’a pas de numéro de téléphone";
        }

        if ($channel !== MessageChannel::Whatsapp || ! $this->whatsapp->usesCloud()) {
            return null;
        }

        // Le marketing sans consentement est la première cause de
        // bannissement : le client bloque, la note tombe, Meta coupe.
        if ($type->isMarketing() && ! $customer->acceptsWhatsapp()) {
            return "{$name} n’a pas accepté de recevoir des publicités sur WhatsApp";
        }

        if ($customer->whatsapp_opt_out_at !== null && ! $customer->acceptsWhatsapp()) {
            return "{$name} a demandé à ne plus être contacté sur WhatsApp";
        }

        // Hors fenêtre de service, seul un modèle approuvé passe.
        if (blank($whatsappTemplate) && ! $this->whatsapp->windowIsOpen($customer)) {
            return "{$name} n’a pas écrit depuis plus de 24 h : choisissez un modèle approuvé";
        }

        return null;
    }

    /** Motif regroupé, pour l'aperçu avant envoi. */
    protected function reasonKey(
        Customer $customer,
        MessageChannel $channel,
        MessageType $type,
        ?string $whatsappTemplate,
    ): string {
        if (blank($this->recipientFor($customer, $channel))) {
            return $channel === MessageChannel::Email
                ? 'sans adresse e-mail'
                : 'sans numéro de téléphone';
        }

        if ($type->isMarketing() && ! $customer->acceptsWhatsapp()) {
            return 'sans consentement WhatsApp';
        }

        if ($customer->whatsapp_opt_out_at !== null) {
            return 'désinscrits de WhatsApp';
        }

        if (blank($whatsappTemplate)) {
            return 'hors fenêtre de 24 h (modèle approuvé nécessaire)';
        }

        return 'écartés';
    }

    protected function recipientFor(Customer $customer, MessageChannel $channel): ?string
    {
        $value = $channel === MessageChannel::Email
            ? $customer->email
            : $customer->phone;

        return filled($value) ? (string) $value : null;
    }
}
