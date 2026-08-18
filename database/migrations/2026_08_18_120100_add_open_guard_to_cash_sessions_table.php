<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_sessions', function (Blueprint $table) {
            // Une valeur constante pour la caisse ouverte, NULL pour toutes
            // les caisses closes. Une contrainte unique accepte plusieurs
            // NULL mais jamais deux « 1 ».
            $table->unsignedTinyInteger('open_guard')->nullable()->unique();
        });

        DB::table('cash_sessions')
            ->where('status', 'ouverte')
            ->update(['open_guard' => 1]);
    }

    public function down(): void
    {
        Schema::table('cash_sessions', function (Blueprint $table) {
            $table->dropUnique(['open_guard']);
            $table->dropColumn('open_guard');
        });
    }
};
