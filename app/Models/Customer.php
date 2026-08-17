<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $type
 * @property string $name
 * @property string|null $company_name
 * @property string|null $phone
 * @property Carbon|null $whatsapp_opt_in_at
 * @property Carbon|null $whatsapp_opt_out_at
 * @property Carbon|null $whatsapp_last_inbound_at
 * @property string|null $email
 * @property string|null $address
 * @property string|null $city
 * @property float|null $latitude
 * @property float|null $longitude
 * @property int|null $location_accuracy
 * @property Carbon|null $located_at
 * @property Carbon|null $location_consent_at
 * @property string|null $ninea
 * @property string|null $notes
 * @property bool $is_active
 * @property string|null $password
 * @property Carbon|null $last_login_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Collection<int, Sale> $sales
 * @property-read Collection<int, Document> $documents
 * @property-read Collection<int, Order> $orders
 * @property-read Collection<int, Vault> $vaults
 */
#[Fillable([
    'type', 'name', 'company_name', 'phone', 'email',
    'address', 'city', 'ninea', 'notes', 'is_active', 'password',
    'latitude', 'longitude', 'location_accuracy', 'located_at', 'location_consent_at',
    'whatsapp_opt_in_at', 'whatsapp_opt_out_at', 'whatsapp_last_inbound_at',
])]
#[Hidden(['password', 'remember_token'])]
/**
 * Le client s'authentifie sur la boutique en ligne avec sa propre garde.
 *
 * Fichier client et comptes d'accès sont la même table : celui qui achète au
 * comptoir et celui qui commande en ligne sont la même personne, et son
 * historique doit être d'un seul tenant. Mais la garde est distincte de celle
 * du personnel — un acheteur ne doit jamais pouvoir atterrir dans
 * l'administration, même par accident de configuration.
 */
class Customer extends Authenticatable
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
            'last_login_at' => 'datetime',
            'latitude' => 'float',
            'longitude' => 'float',
            'location_accuracy' => 'integer',
            'located_at' => 'datetime',
            'location_consent_at' => 'datetime',
            'whatsapp_opt_in_at' => 'datetime',
            'whatsapp_opt_out_at' => 'datetime',
            'whatsapp_last_inbound_at' => 'datetime',
        ];
    }

    /** @return HasMany<Sale, $this> */
    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    /** @return HasMany<Document, $this> */
    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    /** @return HasMany<Order, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class)->latest('placed_at');
    }

    /** @return HasMany<Vault, $this> */
    public function vaults(): HasMany
    {
        return $this->hasMany(Vault::class)->latest('id');
    }

    /** @return HasMany<SaleReturn, $this> */
    public function returns(): HasMany
    {
        return $this->hasMany(SaleReturn::class)->latest('returned_at');
    }

    /** Le client a-t-il une position enregistrée et consentie ? */
    public function hasLocation(): bool
    {
        return $this->location_consent_at !== null
            && $this->latitude !== null
            && $this->longitude !== null;
    }

    /** Le client a-t-il créé un compte sur la boutique en ligne ? */
    public function hasWebAccount(): bool
    {
        return filled($this->password);
    }

    /** @param  Builder<self>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
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
                ->orWhere('company_name', 'like', "%{$term}%")
                ->orWhere('email', 'like', "%{$term}%");
        });
    }

    /**
     * Le client accepte-t-il d'être contacté sur WhatsApp ?
     *
     * Un refus prime toujours sur un accord, quelle que soit la date : celui
     * qui a dit « stop » ne doit plus rien recevoir tant qu'il n'a pas
     * redonné son accord explicitement.
     */
    public function acceptsWhatsapp(): bool
    {
        if ($this->whatsapp_opt_out_at !== null) {
            return $this->whatsapp_opt_in_at !== null
                && $this->whatsapp_opt_in_at->gt($this->whatsapp_opt_out_at);
        }

        return $this->whatsapp_opt_in_at !== null;
    }

    /** @param  Builder<self>  $query */
    public function scopeWhatsappOptedIn(Builder $query): void
    {
        $query->whereNotNull('whatsapp_opt_in_at')
            ->where(function (Builder $q) {
                $q->whereNull('whatsapp_opt_out_at')
                    ->orWhereColumn('whatsapp_opt_in_at', '>', 'whatsapp_opt_out_at');
            });
    }

    /** Nom affiché : raison sociale si c'est une entreprise. */
    public function displayName(): string
    {
        return $this->type === 'entreprise' && filled($this->company_name)
            ? (string) $this->company_name
            : $this->name;
    }
}
