<?php

namespace App\Enums;

enum SaleStatus: string
{
    case Validee = 'validee';
    case Annulee = 'annulee';
    case Remboursee = 'remboursee';

    public function label(): string
    {
        return match ($this) {
            self::Validee => 'Validée',
            self::Annulee => 'Annulée',
            self::Remboursee => 'Remboursée',
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
