<?php

namespace App\Enums;

enum ReturnReason: string
{
    case Defaut = 'defaut';
    case Taille = 'taille';
    case Erreur = 'erreur';
    case NonSatisfait = 'non_satisfait';
    case Autre = 'autre';

    public function label(): string
    {
        return match ($this) {
            self::Defaut => 'Article défectueux',
            self::Taille => 'Mauvaise taille ou format',
            self::Erreur => 'Erreur de préparation',
            self::NonSatisfait => 'Client non satisfait',
            self::Autre => 'Autre motif',
        };
    }

    /**
     * Un article rendu pour un defaut ne repart pas en rayon par defaut :
     * le proposer en remise en stock serait le chemin le plus court vers une
     * seconde reclamation.
     */
    public function restockByDefault(): bool
    {
        return $this !== self::Defaut;
    }

    /** @return array<int, array{value: string, label: string, restock: bool}> */
    public static function options(): array
    {
        return array_map(
            fn (self $case) => [
                'value' => $case->value,
                'label' => $case->label(),
                'restock' => $case->restockByDefault(),
            ],
            self::cases(),
        );
    }
}
