<?php

namespace App\Enums;

/**
 * Comment le client est dedommage.
 *
 * « Avoir » et « Échange » ne sortent pas d'argent : le premier cree une
 * creance a valoir sur un prochain achat, le second est solde par une vente
 * enregistree dans la foulee. Les autres sont des remboursements reels.
 */
enum RefundMethod: string
{
    case Especes = 'especes';
    case Wave = 'wave';
    case OrangeMoney = 'orange_money';
    case FreeMoney = 'free_money';
    case Carte = 'carte';
    case Virement = 'virement';
    case Avoir = 'avoir';
    case Echange = 'echange';

    public function label(): string
    {
        return match ($this) {
            self::Especes => 'Espèces',
            self::Wave => 'Wave',
            self::OrangeMoney => 'Orange Money',
            self::FreeMoney => 'Free Money',
            self::Carte => 'Carte bancaire',
            self::Virement => 'Virement',
            self::Avoir => 'Avoir à valoir',
            self::Echange => 'Échange immédiat',
        };
    }

    /** Vrai quand de l'argent quitte reellement la boutique. */
    public function movesMoney(): bool
    {
        return ! in_array($this, [self::Avoir, self::Echange], true);
    }

    /** Moyen de paiement correspondant, pour le mouvement de caisse. */
    public function paymentMethod(): ?PaymentMethod
    {
        return $this->movesMoney() ? PaymentMethod::from($this->value) : null;
    }

    /** @return array<int, array{value: string, label: string, movesMoney: bool}> */
    public static function options(): array
    {
        return array_map(
            fn (self $case) => [
                'value' => $case->value,
                'label' => $case->label(),
                'movesMoney' => $case->movesMoney(),
            ],
            self::cases(),
        );
    }
}
