<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Un arrivage = une reception de marchandise chez un fournisseur.
 * Les frais annexes (transport, douane, autres) sont repartis au prorata de la
 * valeur des lignes pour obtenir le vrai prix de revient rendu boutique.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arrivals', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();  // ARR-2026-0001
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->date('arrival_date');
            $table->string('status')->default('brouillon'); // brouillon, receptionne

            $table->string('currency', 8)->default('XOF');
            $table->decimal('exchange_rate', 14, 6)->default(1); // 1 unite de devise = X FCFA

            $table->unsignedBigInteger('goods_cost')->default(0);    // valeur marchandise en FCFA
            $table->unsignedBigInteger('shipping_cost')->default(0); // transport / fret
            $table->unsignedBigInteger('customs_cost')->default(0);  // douane
            $table->unsignedBigInteger('other_cost')->default(0);    // manutention, divers
            $table->unsignedBigInteger('total_cost')->default(0);
            $table->unsignedInteger('total_quantity')->default(0);

            $table->text('notes')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();

            $table->index('arrival_date');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arrivals');
    }
};
