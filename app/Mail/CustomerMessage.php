<?php

namespace App\Mail;

use App\Models\Message;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Message envoyé à un client.
 *
 * Texte brut volontairement : le gérant écrit dans un simple champ de texte,
 * et un e-mail en texte seul passe mieux les filtres anti-spam qu'un HTML
 * bricolé.
 */
class CustomerMessage extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly Message $message) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->message->subject ?: 'Message',
        );
    }

    public function content(): Content
    {
        return new Content(
            text: 'mail.customer-message',
            with: ['body' => $this->message->body],
        );
    }
}
