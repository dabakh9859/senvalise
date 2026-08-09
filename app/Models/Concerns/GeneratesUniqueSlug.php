<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

/**
 * Slug unique dérivé d'un libellé.
 *
 * « Valises rigides » et « Valises Rigides » donnent le même slug de base :
 * sans suffixe, la seconde fiche ferait échouer la contrainte d'unicité en
 * base. Or ces quasi-doublons existent bel et bien — c'est précisément ce que
 * l'écran Doublons sert à nettoyer, donc la saisie doit d'abord aboutir.
 */
trait GeneratesUniqueSlug
{
    protected function uniqueSlug(string $value, ?int $ignoreId = null): string
    {
        $base = Str::slug($value) ?: 'element';
        $slug = $base;
        $suffix = 2;

        while (static::query()
            ->where('slug', $slug)
            ->when($ignoreId, fn (Builder $query) => $query->whereKeyNot($ignoreId))
            ->exists()
        ) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }
}
