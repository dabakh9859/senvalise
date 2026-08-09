<?php

namespace App\Enums;

enum ArrivalStatus: string
{
    case Brouillon = 'brouillon';
    case Receptionne = 'receptionne';

    public function label(): string
    {
        return match ($this) {
            self::Brouillon => 'Brouillon',
            self::Receptionne => 'Réceptionné',
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
