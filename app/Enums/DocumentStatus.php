<?php

namespace App\Enums;

enum DocumentStatus: string
{
    case Brouillon = 'brouillon';
    case Envoye = 'envoye';
    case Accepte = 'accepte';
    case Refuse = 'refuse';
    case PartiellementPaye = 'partiellement_paye';
    case Paye = 'paye';
    case Livre = 'livre';
    case Annule = 'annule';

    public function label(): string
    {
        return match ($this) {
            self::Brouillon => 'Brouillon',
            self::Envoye => 'Envoyé',
            self::Accepte => 'Accepté',
            self::Refuse => 'Refusé',
            self::PartiellementPaye => 'Partiellement payé',
            self::Paye => 'Payé',
            self::Livre => 'Livré',
            self::Annule => 'Annulé',
        };
    }

    /** Couleur du badge côté interface. */
    public function tone(): string
    {
        return match ($this) {
            self::Brouillon => 'neutral',
            self::Envoye => 'info',
            self::Accepte, self::Paye, self::Livre => 'success',
            self::PartiellementPaye => 'warning',
            self::Refuse, self::Annule => 'danger',
        };
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(
            fn (self $case) => ['value' => $case->value, 'label' => $case->label()],
            self::cases(),
        );
    }
}
