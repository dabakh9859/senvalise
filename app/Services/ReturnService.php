<?php

namespace App\Services;

use App\Enums\CashCategory;
use App\Enums\MovementReason;
use App\Enums\RefundMethod;
use App\Enums\ReturnReason;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleReturn;
use App\Models\SaleReturnItem;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Enregistrement des retours client.
 *
 * Trois choses se passent d'un coup et doivent tenir ou echouer ensemble : la
 * marchandise revient (ou pas, si elle est cassee), le client est dedommage,
 * et la caisse en garde la trace. D'ou la transaction.
 */
class ReturnService
{
    public function __construct(
        private readonly StockService $stock,
        private readonly CashSessionService $cash,
    ) {}

    /**
     * @param  array<int, array{product_variant_id?: int|null, designation?: string, quantity: int, unit_price: int, restocked?: bool}>  $lines
     * @param  array<string, mixed>  $attributes
     */
    public function create(array $lines, array $attributes = []): SaleReturn
    {
        if ($lines === []) {
            throw new RuntimeException('Un retour doit porter sur au moins un article.');
        }

        return DB::transaction(function () use ($lines, $attributes) {
            // La cle est lue une fois avant d'etre testee : ecrire
            // « $attributes['reason'] instanceof ... » evalue la case avant le
            // ?? de la branche, et leve une erreur des que l'appelant ne
            // passe pas de motif.
            $rawReason = $attributes['reason'] ?? null;
            $reason = $rawReason instanceof ReturnReason
                ? $rawReason
                : ReturnReason::from((string) ($rawReason ?? ReturnReason::Autre->value));

            $rawMethod = $attributes['refund_method'] ?? null;
            $refundMethod = $rawMethod instanceof RefundMethod
                ? $rawMethod
                : RefundMethod::from((string) ($rawMethod ?? RefundMethod::Especes->value));

            /** @var Sale|null $sale */
            $sale = isset($attributes['sale_id'])
                ? Sale::query()->find($attributes['sale_id'])
                : null;

            $prepared = $this->prepareLines($lines);
            $total = array_sum(array_map(fn (array $l) => $l['line_total'], $prepared));

            $return = SaleReturn::create([
                'reference' => SaleReturn::nextReference(),
                'sale_id' => $sale?->id,
                // Le client de la vente d'origine prime : c'est lui qui a paye.
                'customer_id' => $sale->customer_id ?? ($attributes['customer_id'] ?? null),
                'user_id' => Auth::id(),
                'returned_at' => $attributes['returned_at'] ?? now(),
                'reason' => $reason->value,
                'refund_method' => $refundMethod->value,
                'total_refund' => $total,
                'note' => $attributes['note'] ?? null,
            ]);

            foreach ($prepared as $line) {
                SaleReturnItem::create([
                    'sale_return_id' => $return->id,
                    'product_variant_id' => $line['variant']?->id,
                    'designation' => $line['designation'],
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'line_total' => $line['line_total'],
                    'restocked' => $line['restocked'],
                ]);

                if ($line['restocked'] && $line['variant'] instanceof ProductVariant) {
                    $this->stock->move(
                        variant: $line['variant'],
                        quantity: $line['quantity'],
                        reason: MovementReason::RetourClient,
                        reference: $return,
                        note: "Retour {$return->reference}",
                    );
                }
            }

            // Un avoir ou un echange ne sort pas d'argent du tiroir : il ne doit
            // rien y ecrire, sinon la fermeture reclamerait un manquant qui
            // n'existe pas.
            if ($refundMethod->movesMoney() && $total > 0) {
                $this->cash->record([
                    'category' => CashCategory::RemboursementClient,
                    'label' => "Remboursement retour {$return->reference}",
                    'amount' => $total,
                    'payment_method' => $refundMethod->paymentMethod()?->value,
                    'note' => $return->customer?->displayName(),
                ]);
            }

            return $return->load('items');
        });
    }

    /** Solde un avoir : le client l'a consomme sur un nouvel achat. */
    public function consumeCredit(SaleReturn $return): SaleReturn
    {
        if (! $return->isOpenCredit()) {
            throw new RuntimeException('Ce retour n’a pas d’avoir en cours.');
        }

        $return->update(['credit_used_at' => now()]);

        return $return;
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @return array<int, array<string, mixed>>
     */
    protected function prepareLines(array $lines): array
    {
        $prepared = [];

        foreach ($lines as $line) {
            $quantity = max(1, (int) ($line['quantity'] ?? 1));
            /** @var ProductVariant|null $variant */
            $variant = isset($line['product_variant_id'])
                ? ProductVariant::query()->with('product:id,name')->find($line['product_variant_id'])
                : null;

            $designation = (string) ($line['designation'] ?? $variant?->fullLabel() ?? 'Article');
            $unitPrice = max(0, (int) ($line['unit_price'] ?? $variant->selling_price ?? 0));

            $prepared[] = [
                'variant' => $variant,
                'designation' => $designation,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'line_total' => $unitPrice * $quantity,
                'restocked' => (bool) ($line['restocked'] ?? true),
            ];
        }

        return $prepared;
    }
}
