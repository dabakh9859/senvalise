<?php

namespace App\Services\Messaging;

use App\Models\Setting;
use Illuminate\Support\Facades\Config;

/**
 * Réglages d'envoi d'e-mail.
 *
 * Ils sont saisis dans l'application plutôt que dans un fichier : le gérant
 * doit pouvoir changer de fournisseur sans toucher au serveur. Ils sont
 * appliqués à la configuration Laravel juste avant l'envoi.
 */
class MailSettings
{
    public const KEYS = [
        'mail_host',
        'mail_port',
        'mail_username',
        'mail_encryption',
        'mail_from_address',
        'mail_from_name',
    ];

    public const SECRET_KEY = 'mail_password';

    public function isConfigured(): bool
    {
        return filled(Setting::get('mail_host'))
            && filled(Setting::get('mail_from_address'));
    }

    /** @return array<string, mixed> */
    public function values(): array
    {
        $values = [];

        foreach (self::KEYS as $key) {
            $values[$key] = Setting::get($key, '');
        }

        // Le mot de passe n'est jamais renvoyé, seulement sa présence.
        $values['has_password'] = filled(Setting::get(self::SECRET_KEY));

        return $values;
    }

    /** Bascule la configuration Laravel sur les réglages enregistrés. */
    public function apply(): void
    {
        if (! $this->isConfigured()) {
            return;
        }

        $encryption = (string) Setting::get('mail_encryption', 'tls');

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', (string) Setting::get('mail_host'));
        Config::set('mail.mailers.smtp.port', (int) Setting::get('mail_port', 587));
        Config::set('mail.mailers.smtp.username', (string) Setting::get('mail_username', ''));
        Config::set('mail.mailers.smtp.password', (string) Setting::get(self::SECRET_KEY, ''));
        Config::set(
            'mail.mailers.smtp.scheme',
            $encryption === 'ssl' ? 'smtps' : 'smtp',
        );
        Config::set('mail.from.address', (string) Setting::get('mail_from_address'));
        Config::set('mail.from.name', (string) Setting::get('mail_from_name', Setting::get('shop_name', 'SenValise')));
    }
}
