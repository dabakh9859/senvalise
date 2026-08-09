<?php

namespace App\Jobs;

use App\Enums\MessageChannel;
use App\Enums\MessageStatus;
use App\Mail\CustomerMessage;
use App\Models\Message;
use App\Services\Messaging\MailSettings;
use App\Services\Messaging\WhatsAppGateway;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Throwable;

/**
 * Envoie un message, e-mail ou WhatsApp.
 *
 * Un message par tâche : si un destinataire échoue (adresse invalide, numéro
 * absent de WhatsApp), les autres partent quand même, et l'échec reste visible
 * dans l'historique avec sa raison.
 */
class SendMessageJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var array<int, int> Attente croissante entre deux essais. */
    public array $backoff = [10, 60];

    public function __construct(
        public readonly int $messageId,
        public readonly string $language = 'fr',
    ) {}

    public function handle(MailSettings $mail, WhatsAppGateway $whatsapp): void
    {
        $message = Message::with('customer')->find($this->messageId);

        if (! $message || $message->status === MessageStatus::Envoye) {
            return;
        }

        try {
            $externalId = match ($message->channel) {
                MessageChannel::Email => $this->sendEmail($message, $mail),
                MessageChannel::Whatsapp => $whatsapp->send(
                    phone: $message->recipient,
                    body: $message->body,
                    customer: $message->customer,
                    template: $message->template_name,
                    language: $this->language,
                    parameters: $this->templateParameters($message),
                ),
            };
        } catch (Throwable $e) {
            $message->markFailed($e->getMessage());

            throw $e;
        }

        $message->markSent($externalId);
    }

    /** Dernier essai épuisé : on fige l'échec pour qu'il reste lisible. */
    public function failed(Throwable $exception): void
    {
        Message::find($this->messageId)?->markFailed($exception->getMessage());
    }

    protected function sendEmail(Message $message, MailSettings $mail): ?string
    {
        if (! $mail->isConfigured()) {
            throw new RuntimeException(
                "L'envoi d'e-mails n'est pas configuré. Renseignez le serveur dans Réglages → Intégrations.",
            );
        }

        $mail->apply();

        Mail::to($message->recipient, $message->recipient_name)
            ->send(new CustomerMessage($message));

        return null;
    }

    /**
     * Variables passées au modèle approuvé.
     *
     * Le modèle est figé chez Meta ; seules ses variables changent. On envoie
     * le nom du client et le texte composé, ce qui couvre les modèles simples
     * du type « Bonjour {{1}}, {{2}} ».
     *
     * @return array<int, string>
     */
    protected function templateParameters(Message $message): array
    {
        if (blank($message->template_name)) {
            return [];
        }

        return [
            $message->recipient_name ?? 'cher client',
            // WhatsApp refuse les sauts de ligne et les espaces doubles dans
            // une variable de modèle.
            trim((string) preg_replace('/\s+/', ' ', $message->body)),
        ];
    }
}
