<?php

namespace App\Services;

use App\Enums\CashCategory;
use App\Enums\CashSessionStatus;
use App\Enums\PaymentMethod;
use App\Models\CashMovement;
use App\Models\CashSession;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Ouverture, alimentation et fermeture du tiroir-caisse.
 *
 * Une seule caisse peut etre ouverte a la fois : deux sessions concurrentes
 * rendraient le theorique impossible a attribuer, puisque les ventes sont
 * rattachees par leur horodatage et non par une cle etrangere.
 */
class CashSessionService
{
    public function open(int $openingFloat, ?string $note = null): CashSession
    {
        return DB::transaction(function () use ($openingFloat, $note) {
            if (CashSession::current() !== null) {
                throw new RuntimeException('Une caisse est déjà ouverte. Fermez-la avant d’en ouvrir une autre.');
            }

            return CashSession::create([
                'reference' => CashSession::nextReference(),
                'opened_by' => Auth::id(),
                'opened_at' => now(),
                'opening_float' => max(0, $openingFloat),
                'opening_note' => $note,
                'status' => CashSessionStatus::Ouverte->value,
            ]);
        });
    }

    /**
     * Ferme la caisse sur un comptage reel.
     *
     * Le theorique est fige ici, avec l'ecart : une fermeture est un constat
     * date. Le recalculer plus tard donnerait un autre chiffre des qu'une vente
     * de la journee serait annulee, et le constat ne vaudrait plus rien.
     */
    public function close(CashSession $session, int $countedCash, ?string $note = null): CashSession
    {
        return DB::transaction(function () use ($session, $countedCash, $note) {
            /** @var CashSession $locked */
            $locked = CashSession::query()->lockForUpdate()->findOrFail($session->getKey());

            if (! $locked->isOpen()) {
                throw new RuntimeException('Cette caisse est déjà fermée.');
            }

            $expected = $locked->expectedCash();

            $locked->update([
                'closed_by' => Auth::id(),
                'closed_at' => now(),
                'counted_cash' => max(0, $countedCash),
                'expected_cash' => $expected,
                'variance' => max(0, $countedCash) - $expected,
                'closing_note' => $note,
                'status' => CashSessionStatus::Fermee->value,
            ]);

            return $locked;
        });
    }

    /**
     * Enregistre un achat, une depense, un apport ou un prelevement.
     *
     * Le mouvement se raccroche tout seul a la caisse ouverte s'il y en a une.
     * Sinon il existe quand meme : un achat paye un dimanche reste un achat du
     * mois, il ne doit pas disparaitre faute de tiroir ouvert.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function record(array $attributes): CashMovement
    {
        // Meme precaution que dans ReturnService : on lit avant de tester.
        $rawCategory = $attributes['category'] ?? null;
        $category = $rawCategory instanceof CashCategory
            ? $rawCategory
            : CashCategory::from((string) $rawCategory);

        $amount = max(0, (int) ($attributes['amount'] ?? 0));

        if ($amount <= 0) {
            throw new RuntimeException('Le montant doit être supérieur à zéro.');
        }

        $occurredAt = isset($attributes['occurred_at'])
            ? Carbon::parse($attributes['occurred_at'])
            : now();

        $session = CashSession::current();

        return CashMovement::create([
            'cash_session_id' => $session?->id,
            'user_id' => Auth::id(),
            'supplier_id' => $attributes['supplier_id'] ?? null,
            // La direction se deduit de la categorie : laisser l'ecran la
            // choisir permettrait d'enregistrer un loyer en entree de caisse.
            'direction' => $category->direction()->value,
            'category' => $category->value,
            'label' => (string) $attributes['label'],
            'amount' => $amount,
            'payment_method' => $attributes['payment_method'] ?? PaymentMethod::Especes->value,
            'occurred_at' => $occurredAt,
            'note' => $attributes['note'] ?? null,
        ]);
    }
}
