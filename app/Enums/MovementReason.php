<?php

namespace App\Enums;

enum MovementReason: string
{
    case Arrivage = 'arrivage';
    case Vente = 'vente';
    case RetourClient = 'retour_client';
    case RetourFournisseur = 'retour_fournisseur';
    case Perte = 'perte';
    case Casse = 'casse';
    case Vol = 'vol';
    case Inventaire = 'inventaire';
    case Correction = 'correction';

    public function label(): string
    {
        return match ($this) {
            self::Arrivage => 'Arrivage',
            self::Vente => 'Vente',
            self::RetourClient => 'Retour client',
            self::RetourFournisseur => 'Retour fournisseur',
            self::Perte => 'Perte',
            self::Casse => 'Casse',
            self::Vol => 'Vol',
            self::Inventaire => 'Inventaire',
            self::Correction => 'Correction',
        };
    }

    /** Sens naturel du mouvement pour ce motif. */
    public function defaultType(): MovementType
    {
        return match ($this) {
            self::Arrivage, self::RetourClient => MovementType::Entree,
            self::Vente, self::RetourFournisseur, self::Perte, self::Casse, self::Vol => MovementType::Sortie,
            self::Inventaire, self::Correction => MovementType::Ajustement,
        };
    }

    /**
     * Motifs saisissables à la main depuis l'écran Stock.
     *
     * @return array<int, self>
     */
    public static function manualCases(): array
    {
        return [
            self::RetourClient,
            self::RetourFournisseur,
            self::Perte,
            self::Casse,
            self::Vol,
            self::Inventaire,
            self::Correction,
        ];
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(
            fn (self $case) => ['value' => $case->value, 'label' => $case->label()],
            self::cases(),
        );
    }

    /** @return array<int, array{value: string, label: string, type: string}> */
    public static function manualOptions(): array
    {
        return array_map(
            fn (self $case) => [
                'value' => $case->value,
                'label' => $case->label(),
                'type' => $case->defaultType()->value,
            ],
            self::manualCases(),
        );
    }
}
