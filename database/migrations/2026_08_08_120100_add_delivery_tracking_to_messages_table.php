<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Suivi de distribution.
 *
 * WhatsApp ne se contente pas d'accepter un message : il dit ensuite s'il a
 * été remis, lu, ou refusé. Ces accusés arrivent par webhook et permettent de
 * voir un taux de lecture s'effondrer — le signal avant-coureur d'une note de
 * qualité qui bascule.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            // Identifiant attribué par WhatsApp, clé de rapprochement du webhook.
            $table->string('external_id')->nullable()->index()->after('status');
            $table->string('template_name')->nullable()->after('external_id');
            $table->timestamp('delivered_at')->nullable()->after('sent_at');
            $table->timestamp('read_at')->nullable()->after('delivered_at');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn([
                'external_id',
                'template_name',
                'delivered_at',
                'read_at',
            ]);
        });
    }
};
