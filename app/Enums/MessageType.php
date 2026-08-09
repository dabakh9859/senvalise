<?php

namespace App\Enums;

enum MessageType: string
{
    case RappelPaiement = 'rappel_paiement';
    case Publicite = 'publicite';
    case Promotion = 'promotion';
    case Remerciement = 'remerciement';
    case Information = 'information';

    public function label(): string
    {
        return match ($this) {
            self::RappelPaiement => 'Rappel de paiement',
            self::Publicite => 'Publicité',
            self::Promotion => 'Promotion',
            self::Remerciement => 'Remerciement',
            self::Information => 'Information',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::RappelPaiement => 'Relance sur une facture non réglée.',
            self::Publicite => 'Annonce d’un nouvel arrivage ou d’un produit.',
            self::Promotion => 'Offre à durée limitée.',
            self::Remerciement => 'Message après un achat.',
            self::Information => 'Horaires, fermeture, changement d’adresse…',
        };
    }

    /**
     * Ce message fait-il de la promotion ?
     *
     * Meta classe les modèles en trois familles et ne les traite pas pareil.
     * Le marketing exige un consentement explicite, se voit plafonné par
     * destinataire, et c'est lui qui fait chuter la note de qualité quand il
     * part à des gens qui n'ont rien demandé. Un rappel de facture est une
     * suite de transaction : il ne relève pas du même régime.
     */
    public function isMarketing(): bool
    {
        return in_array($this, [self::Publicite, self::Promotion], true);
    }

    /** Famille de modèle correspondante chez Meta. */
    public function metaCategory(): string
    {
        return $this->isMarketing() ? 'MARKETING' : 'UTILITY';
    }

    /** @return array<int, array{value: string, label: string, description: string, isMarketing: bool}> */
    public static function options(): array
    {
        return array_map(
            fn (self $case) => [
                'value' => $case->value,
                'label' => $case->label(),
                'description' => $case->description(),
                'isMarketing' => $case->isMarketing(),
            ],
            self::cases(),
        );
    }
}
