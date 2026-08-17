<?php

namespace App\Enums;

/**
 * Nature d'un mouvement de caisse.
 *
 * Les achats de marchandise sont separes des autres depenses : ce sont les
 * seuls qui alimentent le stock, et le gerant a besoin de les lire seuls pour
 * savoir ce que la boutique a rachete dans la journee.
 */
enum CashCategory: string
{
    case AchatMarchandise = 'achat_marchandise';
    case Fourniture = 'fourniture';
    case Transport = 'transport';
    case Salaire = 'salaire';
    case Loyer = 'loyer';
    case Electricite = 'electricite';
    case RemboursementClient = 'remboursement_client';
    case Divers = 'divers';

    case Apport = 'apport';
    case Remboursement = 'remboursement';
    case AutreEntree = 'autre_entree';

    public function label(): string
    {
        return match ($this) {
            self::AchatMarchandise => 'Achat de marchandise',
            self::Fourniture => 'Fournitures',
            self::Transport => 'Transport',
            self::Salaire => 'Salaire et avance',
            self::Loyer => 'Loyer',
            self::Electricite => 'Électricité et eau',
            self::RemboursementClient => 'Remboursement client',
            self::Divers => 'Divers',
            self::Apport => 'Apport en caisse',
            self::Remboursement => 'Remboursement reçu',
            self::AutreEntree => 'Autre entrée',
        };
    }

    public function direction(): CashDirection
    {
        return match ($this) {
            self::Apport, self::Remboursement, self::AutreEntree => CashDirection::Entree,
            default => CashDirection::Sortie,
        };
    }

    /** Vrai pour ce qui compte comme un achat du jour, par opposition a une charge. */
    public function isPurchase(): bool
    {
        return in_array($this, [self::AchatMarchandise, self::Fourniture], true);
    }

    /** @return array<int, self> */
    public static function outgoing(): array
    {
        return array_values(array_filter(
            self::cases(),
            fn (self $case) => $case->direction() === CashDirection::Sortie,
        ));
    }

    /** @return array<int, self> */
    public static function incoming(): array
    {
        return array_values(array_filter(
            self::cases(),
            fn (self $case) => $case->direction() === CashDirection::Entree,
        ));
    }

    /** @return array<int, array{value: string, label: string, direction: string}> */
    public static function options(): array
    {
        return array_map(
            fn (self $case) => [
                'value' => $case->value,
                'label' => $case->label(),
                'direction' => $case->direction()->value,
            ],
            self::cases(),
        );
    }
}
