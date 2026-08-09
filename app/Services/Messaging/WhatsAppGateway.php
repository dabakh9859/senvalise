<?php

namespace App\Services\Messaging;

use App\Models\Customer;
use App\Models\Setting;
use RuntimeException;

/**
 * Aiguillage entre les deux façons d'envoyer sur WhatsApp.
 *
 * « cloud » est l'API officielle de Meta et le seul mode recommandé en
 * boutique. « waha » pilote un compte WhatsApp ordinaire via un pont non
 * officiel : pratique pour essayer, mais c'est un motif de bannissement du
 * numéro. Le choix est un réglage pour que la boutique puisse démarrer avec
 * l'un et basculer sur l'autre sans rien reprendre ailleurs.
 */
class WhatsAppGateway
{
    public const DRIVER_KEY = 'whatsapp_driver';

    public const CLOUD = 'cloud';

    public const WAHA = 'waha';

    /** Durée de la fenêtre de service ouverte par un message du client. */
    public const WINDOW_HOURS = 24;

    public function __construct(
        private readonly WhatsAppCloudService $cloud,
        private readonly WhatsAppService $waha,
    ) {}

    public function driver(): string
    {
        return Setting::get(self::DRIVER_KEY) === self::WAHA ? self::WAHA : self::CLOUD;
    }

    public function usesCloud(): bool
    {
        return $this->driver() === self::CLOUD;
    }

    public function isConfigured(): bool
    {
        return $this->usesCloud()
            ? $this->cloud->isConfigured()
            : $this->waha->isConfigured();
    }

    /**
     * Envoie un message et renvoie l'identifiant attribué par WhatsApp,
     * quand le transport en fournit un.
     *
     * @param  array<int, string>  $parameters  Variables du modèle.
     */
    public function send(
        string $phone,
        string $body,
        ?Customer $customer = null,
        ?string $template = null,
        string $language = 'fr',
        array $parameters = [],
    ): ?string {
        if (! $this->usesCloud()) {
            $this->waha->send($phone, $body);

            return null;
        }

        // Hors fenêtre de service, seul un modèle approuvé passe. Le vérifier
        // ici plutôt que de laisser Meta refuser : un envoi rejeté compte
        // contre la réputation du numéro.
        if (filled($template)) {
            return $this->cloud->sendTemplate($phone, (string) $template, $language, $parameters);
        }

        if (! $this->windowIsOpen($customer)) {
            throw new RuntimeException(
                'Ce client n’a pas écrit depuis plus de 24 h : il faut un modèle approuvé par Meta pour le joindre.',
            );
        }

        return $this->cloud->sendText($phone, $body);
    }

    /**
     * La fenêtre de service est-elle ouverte pour ce client ?
     *
     * Elle s'ouvre pour 24 heures à chaque message reçu de sa part ; c'est le
     * webhook qui note l'heure.
     */
    public function windowIsOpen(?Customer $customer): bool
    {
        if (! $customer || ! $customer->whatsapp_last_inbound_at) {
            return false;
        }

        return $customer->whatsapp_last_inbound_at->gt(now()->subHours(self::WINDOW_HOURS));
    }

    public function cloud(): WhatsAppCloudService
    {
        return $this->cloud;
    }

    public function waha(): WhatsAppService
    {
        return $this->waha;
    }
}
