<?php

namespace App\Enums;

enum MessageChannel: string
{
    case Email = 'email';
    case Whatsapp = 'whatsapp';

    public function label(): string
    {
        return match ($this) {
            self::Email => 'E-mail',
            self::Whatsapp => 'WhatsApp',
        };
    }

    /** Coordonnée nécessaire pour joindre le client sur ce canal. */
    public function contactField(): string
    {
        return match ($this) {
            self::Email => 'email',
            self::Whatsapp => 'phone',
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
