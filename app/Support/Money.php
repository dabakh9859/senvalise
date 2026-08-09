<?php

namespace App\Support;

/**
 * Mise en forme des montants.
 *
 * Le franc CFA n'a pas de décimales : les montants sont stockés et manipulés
 * en entiers dans toute l'application, ce qui évite les erreurs d'arrondi.
 */
class Money
{
    public const CURRENCY = 'FCFA';

    /** 45000 → « 45 000 FCFA » (espace insécable avant l'unité). */
    public static function format(int|float|null $amount, bool $withCurrency = true): string
    {
        $formatted = number_format((float) ($amount ?? 0), 0, ',', ' ');

        return $withCurrency ? $formatted."\u{00A0}".self::CURRENCY : $formatted;
    }

    /** Accepte « 45 000 », « 45.000 », « 45000 FCFA » → 45000 */
    public static function parse(string|int|float|null $value): int
    {
        if (is_int($value)) {
            return $value;
        }

        if (is_float($value)) {
            return (int) round($value);
        }

        $digits = preg_replace('/[^\d-]/', '', (string) $value);

        return $digits === '' || $digits === '-' ? 0 : (int) $digits;
    }
}
