<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Contenus de la page d'accueil.
 *
 * Bannières, vidéos de publicité, mises en avant. Le gérant les compose depuis
 * l'application plutôt que d'appeler quelqu'un pour changer une image : une
 * promotion de fin de mois ne peut pas attendre un développeur.
 *
 * Les dates de début et de fin permettent de préparer une opération à l'avance
 * et de la voir s'éteindre toute seule.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('home_blocks', function (Blueprint $table) {
            $table->id();
            // banniere | video | promo | argument
            $table->string('type')->default('banniere');
            $table->string('title')->nullable();
            $table->string('subtitle')->nullable();
            $table->text('body')->nullable();
            // Image téléversée (bannière) ou adresse d'une vidéo hébergée.
            $table->string('image_path')->nullable();
            $table->string('video_url')->nullable();
            $table->string('link_url')->nullable();
            $table->string('link_label')->nullable();
            // Produit mis en avant, pour les blocs « promo ».
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();

            $table->index(['type', 'is_active', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('home_blocks');
    }
};
