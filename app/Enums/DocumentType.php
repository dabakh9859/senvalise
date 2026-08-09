<?php

namespace App\Enums;

enum DocumentType: string
{
    case Devis = 'devis';
    case Facture = 'facture';
    case BonLivraison = 'bon_livraison';

    public function label(): string
    {
        return match ($this) {
            self::Devis => 'Devis',
            self::Facture => 'Facture',
            self::BonLivraison => 'Bon de livraison',
        };
    }

    /** Préfixe utilisé dans le numéro du document. */
    public function prefix(): string
    {
        return match ($this) {
            self::Devis => 'DEV',
            self::Facture => 'FA',
            self::BonLivraison => 'BL',
        };
    }

    /**
     * Statuts qui ont du sens pour ce type de document.
     *
     * @return array<int, DocumentStatus>
     */
    public function statuses(): array
    {
        return match ($this) {
            self::Devis => [
                DocumentStatus::Brouillon,
                DocumentStatus::Envoye,
                DocumentStatus::Accepte,
                DocumentStatus::Refuse,
                DocumentStatus::Annule,
            ],
            self::Facture => [
                DocumentStatus::Brouillon,
                DocumentStatus::Envoye,
                DocumentStatus::PartiellementPaye,
                DocumentStatus::Paye,
                DocumentStatus::Annule,
            ],
            self::BonLivraison => [
                DocumentStatus::Brouillon,
                DocumentStatus::Envoye,
                DocumentStatus::Livre,
                DocumentStatus::Annule,
            ],
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
