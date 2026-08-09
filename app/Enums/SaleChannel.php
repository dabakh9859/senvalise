<?php

namespace App\Enums;

enum SaleChannel: string
{
    case Boutique = 'boutique';
    case EnLigne = 'en_ligne';

    public function label(): string
    {
        return match ($this) {
            self::Boutique => 'Boutique',
            self::EnLigne => 'En ligne',
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
