<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * Un bloc de la page d'accueil : bannière, vidéo, promotion, argument.
 *
 * @property int $id
 * @property string $type
 * @property string|null $title
 * @property string|null $subtitle
 * @property string|null $body
 * @property string|null $image_path
 * @property string|null $video_url
 * @property string|null $link_url
 * @property string|null $link_label
 * @property int|null $product_id
 * @property int $position
 * @property bool $is_active
 * @property Carbon|null $starts_at
 * @property Carbon|null $ends_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Product|null $product
 */
#[Fillable([
    'type', 'title', 'subtitle', 'body', 'image_path', 'video_url',
    'link_url', 'link_label', 'product_id', 'position', 'is_active',
    'starts_at', 'ends_at',
])]
class HomeBlock extends Model
{
    public const TYPES = ['banniere', 'video', 'promo', 'argument'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * Adresse publique de l'image, quand il y en a une.
     *
     * Une méthode plutôt qu'un accesseur : le chemin peut être vide, et un
     * accesseur qui renvoie parfois null se prête mal au typage générique.
     */
    public function imageUrl(): ?string
    {
        return filled($this->image_path)
            ? Storage::disk('public')->url((string) $this->image_path)
            : null;
    }

    /**
     * Blocs réellement visibles maintenant.
     *
     * Une opération peut être préparée à l'avance et s'éteindre toute seule :
     * personne n'a à penser à la désactiver le lundi matin.
     *
     * @param  Builder<self>  $query
     */
    public function scopeVisible(Builder $query): void
    {
        $query->where('is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->orderBy('position')
            ->orderBy('id');
    }

    public function typeLabel(): string
    {
        return match ($this->type) {
            'banniere' => 'Bannière',
            'video' => 'Vidéo',
            'promo' => 'Promotion',
            'argument' => 'Argument',
            default => $this->type,
        };
    }
}
