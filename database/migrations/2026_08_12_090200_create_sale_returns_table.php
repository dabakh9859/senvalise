<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Retour client.
 *
 * La vente d'origine est facultative : un client revient parfois avec une
 * valise achetee avant l'installation du logiciel, ou sans son ticket. Refuser
 * le retour dans ce cas ferait sortir le geste du systeme, et il ne serait plus
 * trace du tout.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_returns', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();          // R-2026-000001
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('returned_at');

            $table->string('reason')->default('autre');
            $table->string('refund_method')->default('especes');
            $table->unsignedBigInteger('total_refund')->default(0);

            // Un avoir reste du au client tant qu'il n'a pas ete consomme.
            $table->dateTime('credit_used_at')->nullable();

            $table->text('note')->nullable();
            $table->timestamps();

            $table->index('returned_at');
            $table->index('customer_id');
        });

        Schema::create('sale_return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_return_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained()->nullOnDelete();
            $table->string('designation');
            $table->unsignedInteger('quantity');
            $table->unsignedBigInteger('unit_price')->default(0);
            $table->unsignedBigInteger('line_total')->default(0);
            $table->boolean('restocked')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_return_items');
        Schema::dropIfExists('sale_returns');
    }
};
