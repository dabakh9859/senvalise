<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Journal de tous les mouvements de stock. Chaque ligne est immuable : on ne
 * corrige jamais un mouvement, on en ajoute un nouveau. C'est ce qui permet de
 * retracer l'historique et de savoir qui a fait quoi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_variant_id')->constrained()->cascadeOnDelete();
            $table->string('type');   // entree, sortie, ajustement
            $table->string('reason'); // arrivage, vente, retour_client, retour_fournisseur, perte, casse, vol, inventaire, correction
            $table->integer('quantity');            // signe : positif en entree, negatif en sortie
            $table->integer('quantity_before');
            $table->integer('quantity_after');
            $table->unsignedBigInteger('unit_cost')->nullable(); // FCFA
            $table->nullableMorphs('reference');    // Arrival, Sale, ...
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['product_variant_id', 'created_at']);
            $table->index('created_at');
            $table->index('reason');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
