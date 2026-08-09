<?php

namespace App\Enums;

/**
 * Vie d'une commande en ligne.
 *
 * Le stock est réservé dès la commande, sorti à la confirmation. Une commande
 * annulée avant confirmation libère simplement la réserve ; annulée après, elle
 * remet la marchandise en rayon.
 */
enum OrderStatus: string
{
    case EnAttente = 'en_attente';
    case Confirmee = 'confirmee';
    case Preparee = 'preparee';
    case Expediee = 'expediee';
    case Livree = 'livree';
    case Annulee = 'annulee';

    public function label(): string
    {
        return match ($this) {
            self::EnAttente => 'En attente',
            self::Confirmee => 'Confirmée',
            self::Preparee => 'Prête',
            self::Expediee => 'En livraison',
            self::Livree => 'Livrée',
            self::Annulee => 'Annulée',
        };
    }

    /** Ce que le client lit sur son suivi, écrit de son point de vue. */
    public function customerLabel(): string
    {
        return match ($this) {
            self::EnAttente => 'Commande reçue',
            self::Confirmee => 'Commande confirmée',
            self::Preparee => 'Colis prêt',
            self::Expediee => 'En cours de livraison',
            self::Livree => 'Livrée',
            self::Annulee => 'Annulée',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::EnAttente => 'Nous avons bien reçu votre commande, nous la vérifions.',
            self::Confirmee => 'Vos articles sont réservés pour vous.',
            self::Preparee => 'Votre colis est emballé, il part bientôt.',
            self::Expediee => 'Le livreur est en route.',
            self::Livree => 'Merci de votre confiance.',
            self::Annulee => 'Cette commande a été annulée.',
        };
    }

    public function tone(): string
    {
        return match ($this) {
            self::EnAttente => 'warning',
            self::Confirmee, self::Preparee => 'info',
            self::Expediee => 'info',
            self::Livree => 'success',
            self::Annulee => 'danger',
        };
    }

    /** Étapes du suivi, dans l'ordre. L'annulation n'en fait pas partie. */
    public function step(): int
    {
        return match ($this) {
            self::EnAttente => 1,
            self::Confirmee => 2,
            self::Preparee => 3,
            self::Expediee => 4,
            self::Livree => 5,
            self::Annulee => 0,
        };
    }

    /** Le stock est-il déjà sorti du rayon à ce stade ? */
    public function stockIsOut(): bool
    {
        return in_array($this, [
            self::Confirmee,
            self::Preparee,
            self::Expediee,
            self::Livree,
        ], true);
    }

    public function isFinal(): bool
    {
        return in_array($this, [self::Livree, self::Annulee], true);
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
