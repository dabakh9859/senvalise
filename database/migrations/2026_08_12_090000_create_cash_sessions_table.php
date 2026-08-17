<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Une journee de caisse : on ouvre le matin avec un fond, on encaisse, on paie
 * quelques achats dans la journee, on compte le tiroir le soir.
 *
 * Le theorique n'est pas stocke tant que la caisse est ouverte : il se recalcule
 * a partir des ventes et des mouvements, sinon la moindre vente annulee le
 * laisserait faux. Il n'est fige qu'a la fermeture, avec le compte reel et
 * l'ecart, parce qu'une fermeture est un constat date : il ne doit plus bouger.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();          // C-2026-000001
            $table->foreignId('opened_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('opened_at');
            $table->unsignedBigInteger('opening_float')->default(0);   // fond de caisse
            $table->text('opening_note')->nullable();

            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('closed_at')->nullable();
            $table->unsignedBigInteger('counted_cash')->nullable();    // especes comptees dans le tiroir
            $table->unsignedBigInteger('expected_cash')->nullable();   // theorique fige a la fermeture
            $table->bigInteger('variance')->nullable();                // compte - theorique, signe
            $table->text('closing_note')->nullable();

            $table->string('status')->default('ouverte');   // ouverte, fermee
            $table->timestamps();

            $table->index('status');
            $table->index('opened_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_sessions');
    }
};
