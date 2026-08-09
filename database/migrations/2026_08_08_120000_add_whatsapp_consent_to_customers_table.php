<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Consentement WhatsApp et fenêtre de service.
 *
 * Écrire à quelqu'un qui n'a rien demandé est la première cause de
 * bannissement d'un numéro professionnel : le client bloque ou signale, la
 * note de qualité tombe, Meta coupe. Ces trois dates permettent à
 * l'application de refuser l'envoi avant que Meta n'ait à le faire.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            // Quand le client a accepté d'être contacté sur WhatsApp.
            $table->timestamp('whatsapp_opt_in_at')->nullable()->after('phone');
            // Quand il a demandé à ne plus l'être. Prime toujours sur l'accord.
            $table->timestamp('whatsapp_opt_out_at')->nullable()->after('whatsapp_opt_in_at');
            // Dernier message reçu de sa part : ouvre la fenêtre de 24 h.
            $table->timestamp('whatsapp_last_inbound_at')->nullable()->after('whatsapp_opt_out_at');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'whatsapp_opt_in_at',
                'whatsapp_opt_out_at',
                'whatsapp_last_inbound_at',
            ]);
        });
    }
};
