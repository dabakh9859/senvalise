<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('arrival_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('arrival_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->decimal('unit_cost', 14, 4)->default(0);           // dans la devise de l'arrivage
            $table->unsignedBigInteger('unit_cost_xof')->default(0);   // converti en FCFA
            $table->unsignedBigInteger('landed_unit_cost')->default(0); // FCFA, frais annexes inclus
            $table->unsignedBigInteger('line_total')->default(0);       // FCFA, hors frais annexes
            $table->timestamps();

            $table->unique(['arrival_id', 'product_variant_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('arrival_items');
    }
};
