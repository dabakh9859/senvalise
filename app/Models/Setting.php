<?php

namespace App\Models;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

/**
 * Réglages de la boutique (nom, adresse, TVA, préfixes de numérotation...).
 * Stockés en clé/valeur pour pouvoir en ajouter sans migration.
 *
 * @property int $id
 * @property string $key
 * @property string|null $value
 * @property string $type
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['key', 'value', 'type'])]
class Setting extends Model
{
    private const CACHE_KEY = 'settings.all';

    /**
     * Toutes les valeurs typées, en cache.
     *
     * @return array<string, mixed>
     */
    public static function values(): array
    {
        /** @var array<string, mixed> */
        return Cache::rememberForever(self::CACHE_KEY, function (): array {
            return static::query()
                ->get()
                ->mapWithKeys(fn (self $setting): array => [$setting->key => $setting->castValue()])
                ->all();
        });
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return static::values()[$key] ?? $default;
    }

    public static function put(string $key, mixed $value): void
    {
        $type = match (true) {
            is_bool($value) => 'boolean',
            is_int($value) => 'integer',
            is_array($value) => 'json',
            default => 'string',
        };

        static::updateOrCreate(
            ['key' => $key],
            [
                'value' => $type === 'json' ? json_encode($value) : (string) $value,
                'type' => $type,
            ],
        );

        Cache::forget(self::CACHE_KEY);
    }

    /**
     * Enregistre un secret (clé d'API…) chiffré avec la clé de l'application.
     * Une valeur vide efface le réglage plutôt que de stocker du vide chiffré.
     */
    public static function putSecret(string $key, ?string $value): void
    {
        if (blank($value)) {
            static::where('key', $key)->delete();
            Cache::forget(self::CACHE_KEY);

            return;
        }

        static::updateOrCreate(
            ['key' => $key],
            ['value' => Crypt::encryptString($value), 'type' => 'encrypted'],
        );

        Cache::forget(self::CACHE_KEY);
    }

    /** @param  array<string, mixed>  $values */
    public static function putMany(array $values): void
    {
        foreach ($values as $key => $value) {
            static::put($key, $value);
        }
    }

    protected function castValue(): mixed
    {
        return match ($this->type) {
            'integer' => (int) $this->value,
            'boolean' => filter_var($this->value, FILTER_VALIDATE_BOOLEAN),
            'json' => json_decode((string) $this->value, true),
            'encrypted' => $this->decryptValue(),
            default => $this->value,
        };
    }

    /**
     * Une clé d'application régénérée rend les secrets illisibles ; on renvoie
     * alors null plutôt que de faire tomber toute l'application.
     */
    protected function decryptValue(): ?string
    {
        try {
            return Crypt::decryptString((string) $this->value);
        } catch (DecryptException) {
            return null;
        }
    }

    protected static function booted(): void
    {
        static::saved(fn () => Cache::forget(self::CACHE_KEY));
        static::deleted(fn () => Cache::forget(self::CACHE_KEY));
    }
}
