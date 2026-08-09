<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Message envoyé depuis le formulaire de contact de la boutique.
 *
 * @property int $id
 * @property int|null $customer_id
 * @property string $name
 * @property string|null $phone
 * @property string|null $email
 * @property string|null $subject
 * @property string $body
 * @property string $status
 * @property string|null $answer
 * @property int|null $answered_by
 * @property Carbon|null $answered_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer|null $customer
 * @property-read User|null $responder
 */
#[Fillable([
    'customer_id', 'name', 'phone', 'email', 'subject', 'body',
    'status', 'answer', 'answered_by', 'answered_at',
])]
class ContactMessage extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['answered_at' => 'datetime'];
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<User, $this> */
    public function responder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'answered_by');
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'nouveau' => 'Nouveau',
            'lu' => 'Lu',
            'traite' => 'Traité',
            default => $this->status,
        };
    }

    public function statusTone(): string
    {
        return match ($this->status) {
            'nouveau' => 'warning',
            'lu' => 'info',
            'traite' => 'success',
            default => 'neutral',
        };
    }

    /** @param  Builder<self>  $query */
    public function scopeSearch(Builder $query, ?string $term): void
    {
        if (blank($term)) {
            return;
        }

        $query->where(function (Builder $q) use ($term) {
            $q->where('name', 'like', "%{$term}%")
                ->orWhere('phone', 'like', "%{$term}%")
                ->orWhere('email', 'like', "%{$term}%")
                ->orWhere('subject', 'like', "%{$term}%")
                ->orWhere('body', 'like', "%{$term}%");
        });
    }
}
