<?php

namespace App\Models;

use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
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
 * Commande passée sur la boutique en ligne.
 *
 * @property int $id
 * @property string $reference
 * @property string $tracking_token
 * @property int|null $customer_id
 * @property int|null $delivery_zone_id
 * @property int|null $sale_id
 * @property int|null $vault_id
 * @property string $customer_name
 * @property string $customer_phone
 * @property string|null $customer_email
 * @property string $delivery_address
 * @property string|null $delivery_city
 * @property string|null $delivery_note
 * @property float|null $latitude
 * @property float|null $longitude
 * @property int|null $location_accuracy
 * @property Carbon|null $located_at
 * @property int $subtotal
 * @property int $delivery_fee
 * @property int $discount
 * @property int $total
 * @property int $amount_paid
 * @property OrderStatus $status
 * @property PaymentMethod $payment_method
 * @property string|null $note
 * @property string|null $cancel_reason
 * @property Carbon|null $placed_at
 * @property Carbon|null $confirmed_at
 * @property Carbon|null $shipped_at
 * @property Carbon|null $delivered_at
 * @property Carbon|null $cancelled_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer|null $customer
 * @property-read DeliveryZone|null $zone
 * @property-read Sale|null $sale
 * @property-read Vault|null $vault
 * @property-read Collection<int, OrderItem> $items
 * @property-read int $balance_due
 * @property-read int $item_count
 */
#[Fillable([
    'reference', 'tracking_token', 'customer_id', 'delivery_zone_id', 'sale_id',
    'vault_id', 'customer_name', 'customer_phone', 'customer_email',
    'delivery_address', 'delivery_city', 'delivery_note',
    'latitude', 'longitude', 'location_accuracy', 'located_at',
    'subtotal', 'delivery_fee', 'discount', 'total', 'amount_paid',
    'status', 'payment_method', 'note', 'cancel_reason',
    'placed_at', 'confirmed_at', 'shipped_at', 'delivered_at', 'cancelled_at',
])]
class Order extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class,
            'payment_method' => PaymentMethod::class,
            'subtotal' => 'integer',
            'delivery_fee' => 'integer',
            'discount' => 'integer',
            'total' => 'integer',
            'amount_paid' => 'integer',
            'latitude' => 'float',
            'longitude' => 'float',
            'location_accuracy' => 'integer',
            'located_at' => 'datetime',
            'placed_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'shipped_at' => 'datetime',
            'delivered_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<DeliveryZone, $this> */
    public function zone(): BelongsTo
    {
        return $this->belongsTo(DeliveryZone::class, 'delivery_zone_id');
    }

    /** @return BelongsTo<Sale, $this> */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /** @return BelongsTo<Vault, $this> */
    public function vault(): BelongsTo
    {
        return $this->belongsTo(Vault::class);
    }

    /** @return HasMany<OrderItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /** @return Attribute<int<0, max>, never> */
    protected function balanceDue(): Attribute
    {
        return Attribute::get(fn (): int => max(0, $this->total - $this->amount_paid));
    }

    /** @return Attribute<int, never> */
    protected function itemCount(): Attribute
    {
        return Attribute::get(fn (): int => (int) $this->items->sum('quantity'));
    }

    /** @param  Builder<self>  $query */
    public function scopeOpen(Builder $query): void
    {
        $query->whereNotIn('status', [
            OrderStatus::Livree->value,
            OrderStatus::Annulee->value,
        ]);
    }

    /** @param  Builder<self>  $query */
    public function scopeSearch(Builder $query, ?string $term): void
    {
        if (blank($term)) {
            return;
        }

        $query->where(function (Builder $q) use ($term) {
            $q->where('reference', 'like', "%{$term}%")
                ->orWhere('customer_name', 'like', "%{$term}%")
                ->orWhere('customer_phone', 'like', "%{$term}%")
                ->orWhere('customer_email', 'like', "%{$term}%");
        });
    }

    public function hasLocation(): bool
    {
        return $this->latitude !== null && $this->longitude !== null;
    }

    /** Lien de suivi, valable sans compte. */
    public function trackingUrl(): string
    {
        return route('boutique.suivi', ['token' => $this->tracking_token]);
    }

    /** C-2026-0001 */
    public static function nextReference(?int $year = null): string
    {
        $year ??= (int) now()->format('Y');
        $prefix = "C-{$year}-";

        return app(ReferenceGenerator::class)->next("orders:{$year}", $prefix, 4, 'orders');
    }
}
