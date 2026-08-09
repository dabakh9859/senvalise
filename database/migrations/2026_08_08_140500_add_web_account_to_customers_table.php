<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Compte client sur la boutique en ligne.
 *
 * Les clients s'authentifient sur leur propre table, avec leur propre garde :
 * un acheteur ne doit jamais pouvoir se retrouver dans l'administration, même
 * par accident de configuration. Le fichier client reste unique — celui qui
 * achète au comptoir et celui qui commande en ligne sont la même personne.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            // Null tant que le client n'a pas créé de compte : il peut très
            // bien n'exister que dans le fichier de la boutique.
            $table->string('password')->nullable()->after('email');
            $table->rememberToken()->after('password');
            $table->timestamp('last_login_at')->nullable()->after('remember_token');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['password', 'remember_token', 'last_login_at']);
        });
    }
};
