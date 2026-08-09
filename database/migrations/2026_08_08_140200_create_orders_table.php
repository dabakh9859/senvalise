<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Commandes passées en ligne.
 *
 * Une commande n'est pas une vente : elle est promise, pas encaissée. Elle
 * réserve le stock sans le sortir, et ne devient une vente — avec son
 * mouvement de stock et son ticket — qu'au moment où la boutique la confirme.
 * Sans cette distinction, une commande annulée aurait déjà fait disparaître la
 * marchandise du rayon.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            /*
             * Jeton de suivi.
             *
             * Une commande anonyme doit rester consultable sans compte. Le
             * numéro seul ne suffirait pas : il se devine (C-2026-0043 suit
             * C-2026-0042). Ce jeton aléatoire est la vraie clé du lien de
             * suivi envoyé au client.
             */
            $table->string('tracking_token', 64)->unique();

            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('delivery_zone_id')->nullable()->constrained()->nullOnDelete();
            // Vente créée à la confirmation : le lien entre les deux mondes.
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            // Coffre ayant servi à payer, le cas échéant.
            $table->foreignId('vault_id')->nullable()->constrained()->nullOnDelete();

            // Coordonnées figées à la commande : le client peut déménager
            // ensuite, la livraison de l'époque reste vraie.
            $table->string('customer_name');
            $table->string('customer_phone');
            $table->string('customer_email')->nullable();
            $table->string('delivery_address');
            $table->string('delivery_city')->nullable();
            $table->string('delivery_note')->nullable();

            $table->integer('subtotal')->default(0);
            $table->integer('delivery_fee')->default(0);
            $table->integer('discount')->default(0);
            $table->integer('total')->default(0);
            $table->integer('amount_paid')->default(0);

            $table->string('status')->default('en_attente');
            $table->string('payment_method')->default('a_la_livraison');
            $table->text('note')->nullable();
            $table->text('cancel_reason')->nullable();

            $table->timestamp('placed_at');
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'placed_at']);
            $table->index(['customer_id', 'placed_at']);
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained()->nullOnDelete();
            // Libellé et prix figés : changer un tarif demain ne réécrit pas
            // les commandes déjà passées.
            $table->string('designation');
            $table->string('sku')->nullable();
            $table->unsignedInteger('quantity');
            $table->integer('unit_price');
            $table->integer('line_total');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
    }
};
