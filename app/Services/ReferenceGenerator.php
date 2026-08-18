<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Alloue des références lisibles sans le classique conflit « dernier + 1 ».
 *
 * Le compteur est incrémenté par la base elle-même. L'écriture est donc
 * sérialisée aussi bien par SQLite que par PostgreSQL/MySQL, contrairement à
 * une lecture du dernier enregistrement suivie d'un calcul en PHP.
 */
class ReferenceGenerator
{
    public function next(string $scope, string $prefix, int $padding, string $table): string
    {
        $last = DB::table($table)
            ->where('reference', 'like', $prefix.'%')
            ->orderByDesc('reference')
            ->value('reference');

        $initial = is_string($last) ? (int) substr($last, strlen($prefix)) : 0;

        $number = DB::transaction(function () use ($scope, $initial): int {
            DB::table('reference_counters')->insertOrIgnore([
                'scope' => $scope,
                'value' => $initial,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('reference_counters')
                ->where('scope', $scope)
                ->increment('value', 1, ['updated_at' => now()]);

            return (int) DB::table('reference_counters')
                ->where('scope', $scope)
                ->value('value');
        }, 5);

        return $prefix.str_pad((string) $number, $padding, '0', STR_PAD_LEFT);
    }
}
