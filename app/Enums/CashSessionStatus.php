<?php

namespace App\Enums;

enum CashSessionStatus: string
{
    case Ouverte = 'ouverte';
    case Fermee = 'fermee';

    public function label(): string
    {
        return match ($this) {
            self::Ouverte => 'Ouverte',
            self::Fermee => 'Fermée',
        };
    }
}
