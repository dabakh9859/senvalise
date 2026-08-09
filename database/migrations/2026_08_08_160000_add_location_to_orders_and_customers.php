<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Position de livraison.
 *
 * Au Sénégal, une adresse écrite ne suffit presque jamais à trouver une porte :
 * « Sacré-Cœur 3, villa 128 » envoie le livreur dans le quartier, pas devant
 * la maison. Un point GPS, lui, y envoie exactement.
 *
 * Trois précautions sont inscrites dans la structure même :
 *
 * - La position est **facultative** partout. Un client qui refuse commande
 *   comme avant.
 * - Le **consentement est daté** sur la fiche client. Sans date, impossible de
 *   prouver qu'il a été donné — ni de savoir quand le redemander.
 * - La **précision** est conservée : un point à 2 000 m près n'a pas la même
 *   valeur qu'un point à 10 m, et le livreur doit pouvoir en juger.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->double('latitude')->nullable()->after('city');
            $table->double('longitude')->nullable()->after('latitude');
            // Rayon d'incertitude en mètres, tel que le navigateur l'annonce.
            $table->unsignedInteger('location_accuracy')->nullable()->after('longitude');
            $table->timestamp('located_at')->nullable()->after('location_accuracy');
            // Quand le client a accepté d'être localisé. Le retirer efface la
            // position : c'est le même geste.
            $table->timestamp('location_consent_at')->nullable()->after('located_at');
        });

        Schema::table('orders', function (Blueprint $table) {
            // Figée à la commande : le client peut déménager ensuite, la
            // livraison de l'époque doit rester retrouvable.
            $table->double('latitude')->nullable()->after('delivery_note');
            $table->double('longitude')->nullable()->after('latitude');
            $table->unsignedInteger('location_accuracy')->nullable()->after('longitude');
            $table->timestamp('located_at')->nullable()->after('location_accuracy');
        });

        Schema::table('delivery_zones', function (Blueprint $table) {
            // Centre et portée de la zone : de quoi proposer automatiquement
            // la bonne au client qui accepte d'être localisé.
            $table->double('latitude')->nullable()->after('city');
            $table->double('longitude')->nullable()->after('latitude');
            $table->unsignedSmallInteger('radius_km')->nullable()->after('longitude');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'latitude', 'longitude', 'location_accuracy',
                'located_at', 'location_consent_at',
            ]);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'location_accuracy', 'located_at']);
        });

        Schema::table('delivery_zones', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'radius_km']);
        });
    }
};
