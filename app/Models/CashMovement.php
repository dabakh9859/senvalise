<?php

namespace App\Models;

use App\Enums\CashCategory;
use App\Enums\CashDirection;
use App\Enums\PaymentMethod;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int|null $cash_session_id
 * @property int|null $user_id
 * @property int|null $supplier_id
 * @property CashDirection $direction
 * @property CashCategory $category
 * @property string $label
 * @property int $amount
 * @property PaymentMethod $payment_method
 * @property Carbon $occurred_at
 * @property string|null $note
 * @property-read User|null $user
 * @property-read Supplier|null $supplier
 * @property-read CashSession|null $session
 */
#[Fillable([
    'cash_session_id', 'user_id', 'supplier_id', 'direction', 'category',
    'label', 'amount', 'payment_method', 'occurred_at', 'note',
])]
class CashMovement extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'direction' => CashDirection::class,
            'category' => CashCategory::class,
            'payment_method' => PaymentMethod::class,
            'occurred_at' => 'datetime',
            'amount' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /** @return BelongsTo<CashSession, $this> */
    public function session(): BelongsTo
    {
        return $this->belongsTo(CashSession::class, 'cash_session_id');
    }

    /** Effet reel sur le tiroir : nul des que ce n'est pas regle en especes. */
    public function cashImpact(): int
    {
        if ($this->payment_method !== PaymentMethod::Especes) {
            return 0;
        }

        return $this->direction->sign() * $this->amount;
    }

    /** @param  Builder<self>  $query */
    public function scopeOutgoing(Builder $query): void
    {
        $query->where('direction', CashDirection::Sortie);
    }

    /** @param  Builder<self>  $query */
    public function scopeOnDay(Builder $query, mixed $day): void
    {
        $date = Carbon::parse($day);

        $query->whereBetween('occurred_at', [$date->copy()->startOfDay(), $date->copy()->endOfDay()]);
    }
}
