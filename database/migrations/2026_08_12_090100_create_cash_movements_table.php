<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tout ce qui fait bouger l'argent en dehors des ventes : les achats de la
 * journee, les depenses, les apports et les prelevements.
 *
 * Le moyen de paiement est porte par le mouvement, et pas seulement son
 * montant : un carton de housses regle par Wave est bien une depense du jour,
 * mais il ne sort pas du tiroir. Seules les lignes en especes entrent dans le
 * theorique de la fermeture.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_movements', function (Blueprint $table) {
            $table->id();
            // Nullable : un achat peut etre saisi un jour ou personne n'a
            // ouvert la caisse. Il compte alors dans les achats du jour sans
            // peser sur un tiroir qui n'existe pas.
            $table->foreignId('cash_session_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();

            $table->string('direction');                     // entree, sortie
            $table->string('category');                      // achat_marchandise, fourniture, transport...
            $table->string('label');
            $table->unsignedBigInteger('amount');
            $table->string('payment_method')->default('especes');
            $table->dateTime('occurred_at');
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index('occurred_at');
            $table->index(['direction', 'occurred_at']);
            $table->index('cash_session_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_movements');
    }
};
