<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Une variante = un article vendable reellement (un modele, dans une taille et
 * une couleur donnees). C'est elle qui porte le code-barres et le stock.
 * Tous les montants sont en francs CFA entiers (le XOF n'a pas de decimales).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('sku')->unique();
            $table->string('barcode')->nullable()->unique();
            $table->string('size')->nullable();       // Cabine 55cm, Moyenne 65cm, Grande 75cm, Set 3 pieces
            $table->string('color')->nullable();
            $table->string('dimensions')->nullable(); // ex: 55 x 40 x 20 cm
            $table->decimal('weight_kg', 6, 2)->nullable();
            $table->unsignedInteger('capacity_l')->nullable();

            $table->unsignedBigInteger('cost_price')->default(0);      // prix de revient moyen pondere (PMP)
            $table->unsignedBigInteger('selling_price')->default(0);   // prix de vente boutique
            $table->unsignedBigInteger('web_price')->nullable();       // prix site e-commerce (defaut = selling_price)
            $table->unsignedBigInteger('compare_at_price')->nullable(); // prix barre / avant promo

            $table->integer('stock_quantity')->default(0);
            $table->unsignedInteger('reserved_quantity')->default(0);  // reserve par commandes web non livrees
            $table->unsignedInteger('low_stock_threshold')->default(3);

            $table->unsignedInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['product_id', 'is_active']);
            $table->index('stock_quantity');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variants');
    }
};
