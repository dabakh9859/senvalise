<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Journal des messages envoyés.
 *
 * Le texte est figé à l'envoi : modifier le modèle plus tard ne réécrit pas ce
 * que le client a réellement reçu. Un envoi groupé partage un même batch_id,
 * ce qui évite une table de campagnes pour un besoin aussi simple.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_template_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('document_id')->nullable()->constrained()->nullOnDelete();

            $table->string('type');
            $table->string('channel');
            $table->string('recipient');            // adresse e-mail ou numéro
            $table->string('recipient_name')->nullable();
            $table->string('subject')->nullable();
            $table->text('body');

            $table->string('status')->default('en_attente');
            $table->text('error')->nullable();
            $table->timestamp('sent_at')->nullable();

            $table->uuid('batch_id')->nullable();
            $table->string('batch_label')->nullable();

            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('batch_id');
            $table->index(['type', 'channel']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
    }
};
