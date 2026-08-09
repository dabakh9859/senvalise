<?php

namespace App\Enums;

enum VaultStatus: string
{
    case Ouvert = 'ouvert';
    case Atteint = 'atteint';
    case Utilise = 'utilise';
    case Annule = 'annule';

    public function label(): string
    {
        return match ($this) {
            self::Ouvert => 'En cours',
            self::Atteint => 'Objectif atteint',
            self::Utilise => 'Utilisé',
            self::Annule => 'Annulé',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::Ouvert => 'Continuez à verser pour atteindre votre objectif.',
            self::Atteint => 'Vous pouvez commander votre article dès maintenant.',
            self::Utilise => 'Ce coffre a servi à régler une commande.',
            self::Annule => 'Ce coffre a été fermé.',
        };
    }

    public function tone(): string
    {
        return match ($this) {
            self::Ouvert => 'info',
            self::Atteint => 'success',
            self::Utilise => 'neutral',
            self::Annule => 'danger',
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
