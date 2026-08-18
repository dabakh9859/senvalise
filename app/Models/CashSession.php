<?php

namespace App\Models;

use App\Enums\CashSessionStatus;
use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Services\ReferenceGenerator;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $reference
 * @property int|null $opened_by
 * @property Carbon $opened_at
 * @property int $opening_float
 * @property string|null $opening_note
 * @property int|null $closed_by
 * @property Carbon|null $closed_at
 * @property int|null $counted_cash
 * @property int|null $expected_cash
 * @property int|null $variance
 * @property string|null $closing_note
 * @property int|null $open_guard
 * @property CashSessionStatus $status
 * @property-read User|null $opener
 * @property-read User|null $closer
 * @property-read Collection<int, CashMovement> $movements
 */
#[Fillable([
    'reference', 'opened_by', 'opened_at', 'opening_float', 'opening_note',
    'closed_by', 'closed_at', 'counted_cash', 'expected_cash', 'variance',
    'closing_note', 'status', 'open_guard',
])]
class CashSession extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
            'status' => CashSessionStatus::class,
            'opening_float' => 'integer',
            'counted_cash' => 'integer',
            'expected_cash' => 'integer',
            'variance' => 'integer',
            'open_guard' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function opener(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opened_by');
    }

    /** @return BelongsTo<User, $this> */
    public function closer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    /** @return HasMany<CashMovement, $this> */
    public function movements(): HasMany
    {
        return $this->hasMany(CashMovement::class);
    }

    public function isOpen(): bool
    {
        return $this->status === CashSessionStatus::Ouverte;
    }

    /**
     * Ventes rattachees a la session.
     *
     * Le rattachement se fait par la fenetre de temps et non par une cle
     * etrangere : une vente appartient a la caisse qui etait ouverte au moment
     * ou elle a ete encaissee, et l'ecran de vente n'a pas a savoir qu'une
     * session existe.
     *
     * @return Builder<Sale>
     */
    public function salesQuery(): Builder
    {
        return Sale::query()
            ->where('status', SaleStatus::Validee)
            ->where('sold_at', '>=', $this->opened_at)
            ->when($this->closed_at, fn (Builder $q) => $q->where('sold_at', '<=', $this->closed_at));
    }

    /**
     * Especes reellement entrees par les ventes.
     *
     * On retient le montant encaisse moins la monnaie rendue, pas le total :
     * une vente a credit reglee a moitie ne met dans le tiroir que ce que le
     * client a pose sur le comptoir.
     */
    public function cashFromSales(): int
    {
        $sales = $this->salesQuery()
            ->where('payment_method', PaymentMethod::Especes)
            ->get(['amount_paid', 'total']);

        return (int) $sales->sum(fn (Sale $sale) => max(0, min($sale->amount_paid, $sale->total)));
    }

    /** Somme des mouvements en especes, signee. */
    public function cashFromMovements(): int
    {
        return (int) $this->movements()
            ->where('payment_method', PaymentMethod::Especes)
            ->get(['direction', 'amount'])
            ->sum(fn (CashMovement $movement) => $movement->direction->sign() * $movement->amount);
    }

    /** Ce que le tiroir devrait contenir a l'instant present. */
    public function expectedCash(): int
    {
        return $this->opening_float + $this->cashFromSales() + $this->cashFromMovements();
    }

    /** @param  Builder<self>  $query */
    public function scopeOpen(Builder $query): void
    {
        $query->where('status', CashSessionStatus::Ouverte);
    }

    /** Session ouverte du moment, s'il y en a une. */
    public static function current(): ?self
    {
        return static::query()->open()->latest('opened_at')->first();
    }

    /** C-2026-000001 */
    public static function nextReference(?int $year = null): string
    {
        $year ??= (int) now()->format('Y');
        $prefix = "C-{$year}-";

        return app(ReferenceGenerator::class)->next("cash-sessions:{$year}", $prefix, 6, 'cash_sessions');
    }
}
