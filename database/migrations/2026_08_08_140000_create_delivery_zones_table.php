<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Zones de livraison.
 *
 * Livrer aux Almadies et livrer à Ziguinchor ne coûtent ni le même prix ni le
 * même délai. Le client choisit sa zone, le montant s'ajuste devant lui : rien
 * n'est plus mauvais qu'un frais de livraison découvert à la fin.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_zones', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('city')->nullable();
            // En francs CFA entiers, comme partout dans l'application.
            $table->integer('fee')->default(0);
            $table->unsignedSmallInteger('delay_days')->default(1);
            $table->string('note')->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_zones');
    }
};
