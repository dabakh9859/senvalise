<?php

namespace App\Enums;

enum UserRole: string
{
    case Gerant = 'gerant';
    case Vendeur = 'vendeur';

    public function label(): string
    {
        return match ($this) {
            self::Gerant => 'Gérant',
            self::Vendeur => 'Vendeur',
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
