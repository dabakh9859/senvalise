<?php

namespace App\Services\Shop;

use App\Models\ProductVariant;
use Illuminate\Support\Facades\Session;

/**
 * Le panier de la boutique en ligne.
 *
 * Il vit en session, pas en base : un panier abandonné ne doit pas laisser de
 * trace à nettoyer, et un visiteur qui n'a rien demandé n'a pas à exister dans
 * le fichier client. Seuls les identifiants et les quantités sont conservés —
 * les prix sont relus à chaque affichage, de sorte qu'un panier laissé ouvert
 * trois jours ne fige pas un tarif périmé.
 */
class CartService
{
    private const KEY = 'boutique.panier';

    /**
     * Contenu brut : identifiant de déclinaison => quantité.
     *
     * @return array<int, int>
     */
    public function raw(): array
    {
        /** @var array<int, int> $lines */
        $lines = Session::get(self::KEY, []);

        return $lines;
    }

    public function add(int $variantId, int $quantity = 1): void
    {
        $lines = $this->raw();
        $lines[$variantId] = ($lines[$variantId] ?? 0) + max(1, $quantity);

        $this->store($lines);
    }

    /** Une quantité nulle ou négative retire la ligne. */
    public function setQuantity(int $variantId, int $quantity): void
    {
        $lines = $this->raw();

        if ($quantity <= 0) {
            unset($lines[$variantId]);
        } else {
            $lines[$variantId] = $quantity;
        }

        $this->store($lines);
    }

    public function remove(int $variantId): void
    {
        $lines = $this->raw();
        unset($lines[$variantId]);

        $this->store($lines);
    }

    public function clear(): void
    {
        Session::forget(self::KEY);
    }

    public function count(): int
    {
        return array_sum($this->raw());
    }

    public function isEmpty(): bool
    {
        return $this->raw() === [];
    }

    /**
     * Le panier tel qu'on l'affiche : lignes complètes, prix à jour, alertes
     * de stock.
     *
     * Les articles devenus indisponibles ne sont pas retirés en silence — ils
     * restent visibles, marqués, pour que le client comprenne ce qui change
     * plutôt que de voir son total baisser sans explication.
     *
     * @return array{lines: array<int, array<string, mixed>>, subtotal: int, count: int}
     */
    public function contents(): array
    {
        $lines = $this->raw();

        if ($lines === []) {
            return ['lines' => [], 'subtotal' => 0, 'count' => 0];
        }

        $variants = ProductVariant::with(['product:id,name,slug,is_published', 'product.images'])
            ->whereIn('id', array_keys($lines))
            ->get()
            ->keyBy('id');

        $rows = [];
        $subtotal = 0;

        foreach ($lines as $variantId => $quantity) {
            $variant = $variants->get($variantId);

            if (! $variant || ! $variant->product || ! $variant->product->is_published) {
                continue;
            }

            $price = $this->price($variant);
            $available = $variant->available_quantity;
            $lineTotal = $price * $quantity;
            $subtotal += $lineTotal;

            $rows[] = [
                'variantId' => $variant->id,
                'productId' => $variant->product_id,
                'slug' => $variant->product->slug,
                'label' => $variant->fullLabel(),
                'variantLabel' => $variant->variant_label,
                'sku' => $variant->sku,
                'image' => $this->image($variant),
                'unitPrice' => $price,
                'quantity' => $quantity,
                'lineTotal' => $lineTotal,
                'available' => $available,
                // Le client doit savoir avant de payer, pas après.
                'shortage' => max(0, $quantity - $available),
            ];
        }

        return [
            'lines' => $rows,
            'subtotal' => $subtotal,
            'count' => array_sum(array_column($rows, 'quantity')),
        ];
    }

    /** Prix affiché en ligne : le tarif web s'il existe, sinon celui de la boutique. */
    public function price(ProductVariant $variant): int
    {
        return $variant->web_price > 0 ? $variant->web_price : $variant->selling_price;
    }

    protected function image(ProductVariant $variant): ?string
    {
        $images = $variant->product?->images;

        if (! $images || $images->isEmpty()) {
            return null;
        }

        $primary = $images->firstWhere('is_primary', true) ?? $images->first();

        return $primary->url;
    }

    /** @param  array<int, int>  $lines */
    protected function store(array $lines): void
    {
        $lines = array_filter($lines, fn (int $quantity): bool => $quantity > 0);

        if ($lines === []) {
            $this->clear();

            return;
        }

        Session::put(self::KEY, $lines);
    }
}
