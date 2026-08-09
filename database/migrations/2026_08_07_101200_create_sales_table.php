<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();          // V-2026-000001
            $table->string('channel')->default('boutique'); // boutique, en_ligne
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // vendeur
            $table->dateTime('sold_at');

            $table->unsignedBigInteger('subtotal')->default(0);
            $table->unsignedBigInteger('discount')->default(0);
            $table->unsignedBigInteger('total')->default(0);
            $table->unsignedBigInteger('amount_paid')->default(0);
            $table->unsignedBigInteger('change_due')->default(0);
            $table->unsignedBigInteger('total_cost')->default(0); // prix de revient fige, pour la marge

            $table->string('payment_method')->default('especes'); // especes, wave, orange_money, free_money, carte, virement, a_credit
            $table->string('status')->default('validee');         // validee, annulee, remboursee
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index('sold_at');
            $table->index(['status', 'sold_at']);
            $table->index('channel');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
