<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Devis, factures et bons de livraison partagent la meme structure : une seule
 * table avec un type evite trois modules quasi identiques. Le chainage se fait
 * par parent_document_id (devis -> facture -> bon de livraison).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->string('type');       // devis, facture, bon_livraison
            $table->string('reference')->unique(); // DEV-2026-0001, FA-2026-0001, BL-2026-0001
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('parent_document_id')->nullable()->constrained('documents')->nullOnDelete();

            $table->date('issue_date');
            $table->date('valid_until')->nullable(); // devis
            $table->date('due_date')->nullable();    // facture
            $table->date('delivery_date')->nullable(); // bon de livraison
            $table->string('status')->default('brouillon');

            // Coordonnees figees a l'emission (le client peut etre modifie ensuite)
            $table->string('customer_name')->nullable();
            $table->string('customer_phone')->nullable();
            $table->string('customer_address')->nullable();

            $table->unsignedBigInteger('subtotal')->default(0);
            $table->unsignedBigInteger('discount')->default(0);
            $table->decimal('tax_rate', 5, 2)->default(0); // TVA : 18% au Senegal, 0 si non assujetti
            $table->unsignedBigInteger('tax_amount')->default(0);
            $table->unsignedBigInteger('total')->default(0);
            $table->unsignedBigInteger('amount_paid')->default(0);

            $table->text('notes')->nullable();
            $table->text('terms')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['type', 'issue_date']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};
