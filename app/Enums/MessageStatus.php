<?php

namespace App\Enums;

enum MessageStatus: string
{
    case EnAttente = 'en_attente';
    case Envoye = 'envoye';
    case Echec = 'echec';

    public function label(): string
    {
        return match ($this) {
            self::EnAttente => 'En attente',
            self::Envoye => 'Envoyé',
            self::Echec => 'Échec',
        };
    }

    public function tone(): string
    {
        return match ($this) {
            self::EnAttente => 'warning',
            self::Envoye => 'success',
            self::Echec => 'danger',
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
