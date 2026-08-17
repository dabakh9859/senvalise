<?php

namespace App\Enums;

enum CashDirection: string
{
    case Entree = 'entree';
    case Sortie = 'sortie';

    public function label(): string
    {
        return match ($this) {
            self::Entree => 'Entrée',
            self::Sortie => 'Sortie',
        };
    }

    /** Signe a appliquer au montant pour l'effet sur le tiroir. */
    public function sign(): int
    {
        return $this === self::Entree ? 1 : -1;
    }
}
