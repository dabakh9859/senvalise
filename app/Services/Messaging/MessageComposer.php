<?php

namespace App\Services\Messaging;

use App\Models\Customer;
use App\Models\Document;
use App\Models\Setting;
use App\Support\Money;

/**
 * Remplace les variables d'un modèle de message.
 *
 * Le gérant écrit « Bonjour {client}, votre facture {facture} de {montant}
 * arrive à échéance le {echeance}. » et l'application complète pour chaque
 * destinataire.
 */
class MessageComposer
{
    /**
     * Variables proposées dans l'éditeur, avec leur explication.
     *
     * @return array<int, array{token: string, label: string}>
     */
    public static function variables(): array
    {
        return [
            ['token' => '{client}', 'label' => 'Nom du client'],
            ['token' => '{boutique}', 'label' => 'Nom de la boutique'],
            ['token' => '{telephone}', 'label' => 'Téléphone de la boutique'],
            ['token' => '{date}', 'label' => 'Date du jour'],
            ['token' => '{facture}', 'label' => 'Numéro du document'],
            ['token' => '{montant}', 'label' => 'Montant total'],
            ['token' => '{reste}', 'label' => 'Reste à payer'],
            ['token' => '{echeance}', 'label' => 'Date d’échéance'],
        ];
    }

    public function render(
        string $text,
        ?Customer $customer = null,
        ?Document $document = null,
    ): string {
        $replacements = [
            '{client}' => $customer?->displayName() ?? 'cher client',
            '{boutique}' => (string) Setting::get('shop_name', 'SenValise'),
            '{telephone}' => (string) Setting::get('shop_phone', ''),
            '{date}' => now()->translatedFormat('j F Y'),
            '{facture}' => $document->reference ?? '',
            '{montant}' => $document ? Money::format($document->total) : '',
            '{reste}' => $document ? Money::format($document->balance_due) : '',
            '{echeance}' => $document?->due_date?->translatedFormat('j F Y') ?? '',
        ];

        return strtr($text, $replacements);
    }

    /** Aperçu sur un exemple, pour l'éditeur de modèle. */
    public function preview(string $text): string
    {
        $sample = [
            '{client}' => 'Fatou Ndiaye',
            '{boutique}' => (string) Setting::get('shop_name', 'SenValise'),
            '{telephone}' => (string) Setting::get('shop_phone', '77 885 83 74'),
            '{date}' => now()->translatedFormat('j F Y'),
            '{facture}' => 'FA-'.now()->format('Y').'-0042',
            '{montant}' => Money::format(85000),
            '{reste}' => Money::format(35000),
            '{echeance}' => now()->addDays(15)->translatedFormat('j F Y'),
        ];

        return strtr($text, $sample);
    }
}
