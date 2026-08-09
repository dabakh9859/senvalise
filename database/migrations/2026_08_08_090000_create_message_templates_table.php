<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Modèles de message réutilisables.
 *
 * Le corps accepte des variables ({client}, {montant}, {facture}…) remplacées
 * à l'envoi : on écrit le texte une fois, il sert pour tous les clients.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type');    // rappel_paiement, publicite, promotion...
            $table->string('channel'); // email, whatsapp
            $table->string('subject')->nullable(); // e-mail uniquement
            $table->text('body');
            $table->boolean('is_active')->default(true);
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['type', 'channel']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('message_templates');
    }
};
