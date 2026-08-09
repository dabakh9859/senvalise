<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Le coffre.
 *
 * Une valise à 180 000 F ne se paie pas toujours d'un coup. Le client ouvre un
 * coffre, y verse ce qu'il peut quand il peut, et commande le jour où le
 * montant est atteint. C'est la mise de côté que les boutiques pratiquent déjà
 * sur un carnet — ici elle est tenue par l'application, visible des deux côtés
 * du comptoir, et impossible à contester.
 *
 * Le solde n'est pas une colonne que l'on met à jour : c'est la somme des
 * versements. Un montant écrit à la main finirait par diverger de son
 * historique, et c'est l'historique qui fait foi devant le client.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vaults', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            // Article visé, quand le client sait déjà ce qu'il veut. Facultatif :
            // on peut aussi épargner vers un simple montant.
            $table->foreignId('product_variant_id')->nullable()->constrained()->nullOnDelete();
            $table->string('label');
            $table->integer('target_amount');
            $table->string('status')->default('ouvert');
            $table->text('note')->nullable();
            $table->timestamp('reached_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'status']);
        });

        Schema::create('vault_deposits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vault_id')->constrained()->cascadeOnDelete();
            $table->integer('amount');
            $table->string('payment_method')->default('especes');
            $table->string('reference')->nullable();
            $table->string('note')->nullable();
            // Qui a encaissé : un versement au comptoir engage la boutique.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('deposited_at');
            $table->timestamps();

            $table->index(['vault_id', 'deposited_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vault_deposits');
        Schema::dropIfExists('vaults');
    }
};
