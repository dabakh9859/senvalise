<?php

namespace App\Models;

use App\Enums\VaultStatus;
use App\Services\ReferenceGenerator;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Le coffre d'un client.
 *
 * Le solde n'est jamais stocké : c'est la somme des versements, calculée à
 * chaque lecture. Un total tenu à part finirait par diverger de son historique,
 * et c'est l'historique qu'on montre au client quand il conteste.
 *
 * @property int $id
 * @property string $reference
 * @property int $customer_id
 * @property int|null $product_variant_id
 * @property string $label
 * @property int $target_amount
 * @property VaultStatus $status
 * @property string|null $note
 * @property Carbon|null $reached_at
 * @property Carbon|null $closed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer|null $customer
 * @property-read ProductVariant|null $variant
 * @property-read Collection<int, VaultDeposit> $deposits
 * @property-read Collection<int, Order> $orders
 * @property-read int $saved_amount
 * @property-read int $remaining_amount
 * @property-read int $progress
 */
#[Fillable([
    'reference', 'customer_id', 'product_variant_id', 'label',
    'target_amount', 'status', 'note', 'reached_at', 'closed_at',
])]
class Vault extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'status' => VaultStatus::class,
            'target_amount' => 'integer',
            'reached_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /** @return HasMany<VaultDeposit, $this> */
    public function deposits(): HasMany
    {
        return $this->hasMany(VaultDeposit::class)->orderByDesc('deposited_at');
    }

    /** @return HasMany<Order, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    /** @return Attribute<int, never> */
    protected function savedAmount(): Attribute
    {
        return Attribute::get(fn (): int => (int) $this->deposits()->sum('amount'));
    }

    /** @return Attribute<int<0, max>, never> */
    protected function remainingAmount(): Attribute
    {
        return Attribute::get(fn (): int => max(0, $this->target_amount - $this->saved_amount));
    }

    /**
     * Avancement en pourcentage, plafonné à 100.
     *
     * @return Attribute<int, never>
     */
    protected function progress(): Attribute
    {
        return Attribute::get(function (): int {
            if ($this->target_amount <= 0) {
                return 0;
            }

            return (int) min(100, round(($this->saved_amount / $this->target_amount) * 100));
        });
    }

    public function isSpendable(): bool
    {
        return $this->status === VaultStatus::Atteint;
    }

    /** @param  Builder<self>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereIn('status', [VaultStatus::Ouvert->value, VaultStatus::Atteint->value]);
    }

    /** CF-2026-0001 */
    public static function nextReference(?int $year = null): string
    {
        $year ??= (int) now()->format('Y');
        $prefix = "CF-{$year}-";

        return app(ReferenceGenerator::class)->next("vaults:{$year}", $prefix, 4, 'vaults');
    }
}
