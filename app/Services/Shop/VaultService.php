<?php

namespace App\Services\Shop;

use App\Enums\PaymentMethod;
use App\Enums\VaultStatus;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Vault;
use App\Models\VaultDeposit;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Le coffre : mise de côté progressive.
 *
 * Une valise à 180 000 F ne se paie pas toujours d'un coup. Le client ouvre un
 * coffre, y verse ce qu'il peut, et commande le jour où l'objectif est atteint.
 * C'est le carnet de mise de côté que les boutiques tiennent déjà — sauf que
 * les deux parties voient le même solde, et que chaque versement est daté et
 * attribué à celui qui l'a encaissé.
 *
 * Les versements se font au comptoir : l'application n'encaisse pas d'argent,
 * elle enregistre ce que la boutique a reçu.
 */
class VaultService
{
    public function open(
        Customer $customer,
        string $label,
        int $targetAmount,
        ?ProductVariant $variant = null,
        ?string $note = null,
    ): Vault {
        if ($targetAmount <= 0) {
            throw new RuntimeException('L’objectif doit être supérieur à zéro.');
        }

        return Vault::create([
            'reference' => Vault::nextReference(),
            'customer_id' => $customer->id,
            'product_variant_id' => $variant?->id,
            'label' => $label,
            'target_amount' => $targetAmount,
            'status' => VaultStatus::Ouvert->value,
            'note' => $note,
        ]);
    }

    /**
     * Enregistre un versement.
     *
     * L'objectif atteint bascule le coffre tout seul : personne n'a à y penser,
     * et le client voit son coffre passer au vert le jour même.
     */
    public function deposit(
        Vault $vault,
        int $amount,
        PaymentMethod $method = PaymentMethod::Especes,
        ?string $reference = null,
        ?string $note = null,
    ): VaultDeposit {
        if ($amount === 0) {
            throw new RuntimeException('Le montant du versement ne peut pas être nul.');
        }

        if (in_array($vault->status, [VaultStatus::Utilise, VaultStatus::Annule], true)) {
            throw new RuntimeException('Ce coffre est fermé.');
        }

        return DB::transaction(function () use ($vault, $amount, $method, $reference, $note): VaultDeposit {
            $deposit = VaultDeposit::create([
                'vault_id' => $vault->id,
                'amount' => $amount,
                'payment_method' => $method->value,
                'reference' => $reference,
                'note' => $note,
                'user_id' => Auth::id(),
                'deposited_at' => now(),
            ]);

            $this->refreshStatus($vault->fresh() ?? $vault);

            return $deposit;
        });
    }

    /**
     * Rembourse le coffre et le ferme.
     *
     * Le remboursement est un versement négatif, pas un effacement : le carnet
     * doit rester lisible de bout en bout, y compris quand ça se passe mal.
     */
    public function refund(Vault $vault, ?string $note = null): Vault
    {
        $saved = $vault->saved_amount;

        if ($saved > 0) {
            VaultDeposit::create([
                'vault_id' => $vault->id,
                'amount' => -$saved,
                'payment_method' => PaymentMethod::Especes->value,
                'note' => $note ?? 'Remboursement au client',
                'user_id' => Auth::id(),
                'deposited_at' => now(),
            ]);
        }

        $vault->forceFill([
            'status' => VaultStatus::Annule->value,
            'closed_at' => now(),
        ])->save();

        return $vault;
    }

    /** Recalcule l'état d'après les versements réellement enregistrés. */
    public function refreshStatus(Vault $vault): Vault
    {
        if (in_array($vault->status, [VaultStatus::Utilise, VaultStatus::Annule], true)) {
            return $vault;
        }

        $reached = $vault->saved_amount >= $vault->target_amount;

        $vault->forceFill([
            'status' => $reached ? VaultStatus::Atteint->value : VaultStatus::Ouvert->value,
            'reached_at' => $reached ? ($vault->reached_at ?? now()) : null,
        ])->save();

        return $vault;
    }
}
