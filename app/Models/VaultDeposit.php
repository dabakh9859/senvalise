<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Un versement dans un coffre.
 *
 * On n'efface pas un versement : on en ajoute un négatif si le client reprend
 * son argent. Le carnet reste lisible de bout en bout.
 *
 * @property int $id
 * @property int $vault_id
 * @property int $amount
 * @property PaymentMethod $payment_method
 * @property string|null $reference
 * @property string|null $note
 * @property int|null $user_id
 * @property Carbon|null $deposited_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Vault|null $vault
 * @property-read User|null $user
 */
#[Fillable([
    'vault_id', 'amount', 'payment_method', 'reference',
    'note', 'user_id', 'deposited_at',
])]
class VaultDeposit extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'payment_method' => PaymentMethod::class,
            'deposited_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Vault, $this> */
    public function vault(): BelongsTo
    {
        return $this->belongsTo(Vault::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
