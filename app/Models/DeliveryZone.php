<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $name
 * @property string|null $city
 * @property float|null $latitude
 * @property float|null $longitude
 * @property int|null $radius_km
 * @property int $fee
 * @property int $delay_days
 * @property string|null $note
 * @property int $position
 * @property bool $is_active
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Order> $orders
 */
#[Fillable([
    'name', 'city', 'fee', 'delay_days', 'note', 'position', 'is_active',
    'latitude', 'longitude', 'radius_km',
])]
class DeliveryZone extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'fee' => 'integer',
            'delay_days' => 'integer',
            'position' => 'integer',
            'is_active' => 'boolean',
            'latitude' => 'float',
            'longitude' => 'float',
            'radius_km' => 'integer',
        ];
    }

    /** @return HasMany<Order, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    /** @param  Builder<self>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true)->orderBy('position')->orderBy('name');
    }

    /** La zone est-elle placée sur la carte ? */
    public function isMapped(): bool
    {
        return $this->latitude !== null && $this->longitude !== null;
    }

    /** « Livré sous 1 jour » / « Livré sous 2 à 3 jours ». */
    public function delayLabel(): string
    {
        return $this->delay_days <= 1
            ? 'Livré sous 24 h'
            : "Livré sous {$this->delay_days} jours";
    }
}
