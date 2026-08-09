<?php

namespace App\Http\Controllers\Shop;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\ProductVariant;
use App\Models\Vault;
use App\Models\VaultDeposit;
use App\Services\Shop\GeolocationService;
use App\Services\Shop\OrderService;
use App\Services\Shop\VaultService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * L'espace du client : ses commandes, ses coffres, ses coordonnées.
 *
 * Tout ce qui est affiché ici appartient au client connecté, sans exception.
 * Chaque accès à une commande ou à un coffre passe par sa propre relation —
 * jamais par un identifiant reçu du navigateur.
 */
class ClientAreaController extends Controller
{
    public function __construct(
        private readonly VaultService $vaults,
        private readonly OrderService $orders,
        private readonly GeolocationService $geo,
    ) {}

    public function index(): Response
    {
        $customer = $this->customer();

        $orders = $customer->orders()->with('items')->limit(5)->get();
        $vaults = $customer->vaults()->active()->get();

        return Inertia::render('boutique/espace/accueil', [
            'customer' => $this->profileData($customer),
            'stats' => [
                'orders' => $customer->orders()->count(),
                'openOrders' => $customer->orders()->open()->count(),
                'vaults' => $vaults->count(),
                'saved' => (int) $vaults->sum(fn (Vault $vault) => $vault->saved_amount),
            ],
            'orders' => $orders->map(fn (Order $order) => $this->orderCard($order))->all(),
            'vaults' => $vaults->map(fn (Vault $vault) => $this->vaultCard($vault))->all(),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Commandes
    |--------------------------------------------------------------------------
    */

    public function orders(): Response
    {
        $customer = $this->customer();

        return Inertia::render('boutique/espace/commandes', [
            'orders' => $customer->orders()
                ->with('items')
                ->paginate(10)
                ->through(fn (Order $order) => $this->orderCard($order)),
        ]);
    }

    /** Le client peut annuler tant que la boutique n'a rien préparé. */
    public function cancelOrder(Order $order): RedirectResponse
    {
        $this->assertOwns($order->customer_id);

        try {
            $this->orders->cancel($order, 'Annulée par le client');
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast('Votre commande a été annulée.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Coffres
    |--------------------------------------------------------------------------
    */

    public function vaults(): Response
    {
        $customer = $this->customer();

        return Inertia::render('boutique/espace/coffres', [
            'vaults' => $customer->vaults()
                ->with(['deposits', 'variant.product:id,name,slug'])
                ->get()
                ->map(fn (Vault $vault) => $this->vaultDetail($vault))
                ->values()
                ->all(),
            // Articles proposés comme objectif d'épargne.
            'articles' => ProductVariant::query()
                ->with('product:id,name,is_published,is_active')
                ->where('is_active', true)
                ->whereHas('product', fn ($q) => $q->where('is_published', true)->where('is_active', true))
                ->orderBy('sku')
                ->get()
                ->map(fn (ProductVariant $variant) => [
                    'id' => $variant->id,
                    'label' => $variant->fullLabel(),
                    'price' => $variant->web_price > 0 ? $variant->web_price : $variant->selling_price,
                ])
                ->all(),
        ]);
    }

    /**
     * Ouvre un coffre.
     *
     * Le client fixe lui-même l'objectif, ou le laisse se déduire de l'article
     * visé — c'est plus juste que de recopier un prix qui peut changer.
     */
    public function openVault(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'label' => ['required', 'string', 'max:120'],
            'target_amount' => ['nullable', 'integer', 'min:1000'],
            'product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ], [
            'target_amount.min' => 'L’objectif doit être d’au moins 1 000 FCFA.',
        ]);

        $variant = filled($validated['product_variant_id'] ?? null)
            ? ProductVariant::whereKey((int) $validated['product_variant_id'])->first()
            : null;

        $target = $validated['target_amount']
            ?? ($variant ? ($variant->web_price > 0 ? $variant->web_price : $variant->selling_price) : 0);

        if ($target <= 0) {
            $this->toast('Indiquez un objectif ou choisissez un article.', 'error');

            return back();
        }

        try {
            $this->vaults->open(
                customer: $this->customer(),
                label: $validated['label'],
                targetAmount: (int) $target,
                variant: $variant,
                note: $validated['note'] ?? null,
            );
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast('Coffre ouvert. Passez en boutique pour faire votre premier versement.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Coordonnées
    |--------------------------------------------------------------------------
    */

    public function profile(): Response
    {
        return Inertia::render('boutique/espace/profil', [
            'customer' => $this->profileData($this->customer()),
        ]);
    }

    public function updateProfile(Request $request): RedirectResponse
    {
        $customer = $this->customer();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:180'],
            'phone' => ['required', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:180'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'whatsapp_opt_in' => ['boolean'],
            'password' => ['nullable', 'string', 'min:8', 'confirmed'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'location_accuracy' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ]);

        $latitude = isset($validated['latitude']) ? (float) $validated['latitude'] : null;
        $longitude = isset($validated['longitude']) ? (float) $validated['longitude'] : null;

        unset($validated['latitude'], $validated['longitude'], $validated['location_accuracy']);

        if ($this->geo->isValid($latitude, $longitude)) {
            $validated['latitude'] = $latitude;
            $validated['longitude'] = $longitude;
            $validated['location_accuracy'] = $request->integer('location_accuracy') ?: null;
            $validated['located_at'] = now();
            $validated['location_consent_at'] = $customer->location_consent_at ?? now();
        }

        $optIn = (bool) ($validated['whatsapp_opt_in'] ?? false);
        unset($validated['whatsapp_opt_in']);

        if (blank($validated['password'] ?? null)) {
            unset($validated['password']);
        }

        if ($optIn && ! $customer->acceptsWhatsapp()) {
            $validated['whatsapp_opt_in_at'] = now();
        }

        if (! $optIn && $customer->acceptsWhatsapp()) {
            $validated['whatsapp_opt_out_at'] = now();
        }

        $customer->update($validated);
        $this->toast('Vos informations ont été mises à jour.');

        return back();
    }

    /**
     * Retire la position enregistrée.
     *
     * Un consentement qu'on ne peut pas retirer n'en est pas un. Le geste
     * efface les coordonnées *et* la date d'accord : la prochaine fois,
     * l'autorisation sera redemandée depuis le début.
     */
    public function forgetLocation(): RedirectResponse
    {
        $this->customer()->forceFill([
            'latitude' => null,
            'longitude' => null,
            'location_accuracy' => null,
            'located_at' => null,
            'location_consent_at' => null,
        ])->save();

        $this->toast('Votre position a été effacée.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Assistants
    |--------------------------------------------------------------------------
    */

    protected function customer(): Customer
    {
        $customer = Auth::guard('client')->user();

        abort_unless($customer instanceof Customer, 403);

        return $customer;
    }

    protected function assertOwns(?int $customerId): void
    {
        abort_unless($customerId !== null && $customerId === $this->customer()->id, 403);
    }

    /** @return array<string, mixed> */
    protected function profileData(Customer $customer): array
    {
        return [
            'name' => $customer->name,
            'displayName' => $customer->displayName(),
            'phone' => $customer->phone,
            'email' => $customer->email,
            'address' => $customer->address,
            'city' => $customer->city,
            'whatsappOptIn' => $customer->acceptsWhatsapp(),
            'latitude' => $customer->latitude,
            'longitude' => $customer->longitude,
            'locationAccuracy' => $customer->location_accuracy,
            'accuracyLabel' => $this->geo->accuracyLabel($customer->location_accuracy),
            'locatedAt' => $customer->located_at?->toIso8601String(),
            'hasLocation' => $customer->hasLocation(),
            'mapUrl' => $customer->hasLocation()
                ? $this->geo->mapUrl((float) $customer->latitude, (float) $customer->longitude)
                : null,
        ];
    }

    /** @return array<string, mixed> */
    protected function orderCard(Order $order): array
    {
        return [
            'id' => $order->id,
            'reference' => $order->reference,
            'token' => $order->tracking_token,
            'status' => $order->status->value,
            'statusLabel' => $order->status->customerLabel(),
            'statusTone' => $order->status->tone(),
            'step' => $order->status->step(),
            'total' => $order->total,
            'itemCount' => $order->item_count,
            'placedAt' => $order->placed_at?->toIso8601String(),
            // L'annulation n'est offerte que tant que rien n'est parti.
            'canCancel' => in_array($order->status, [
                OrderStatus::EnAttente,
                OrderStatus::Confirmee,
            ], true),
            'items' => $order->items->map(fn ($item) => [
                'designation' => $item->designation,
                'quantity' => $item->quantity,
                'lineTotal' => $item->line_total,
            ])->all(),
        ];
    }

    /**
     * Le coffre avec son carnet de versements.
     *
     * @return array<string, mixed>
     */
    protected function vaultDetail(Vault $vault): array
    {
        return [
            ...$this->vaultCard($vault),
            'deposits' => $vault->deposits->map(fn (VaultDeposit $deposit) => [
                'id' => $deposit->id,
                'amount' => $deposit->amount,
                'method' => $deposit->payment_method->label(),
                'note' => $deposit->note,
                'date' => $deposit->deposited_at?->toIso8601String(),
            ])->all(),
        ];
    }

    /** @return array<string, mixed> */
    protected function vaultCard(Vault $vault): array
    {
        return [
            'id' => $vault->id,
            'reference' => $vault->reference,
            'label' => $vault->label,
            'target' => $vault->target_amount,
            'saved' => $vault->saved_amount,
            'remaining' => $vault->remaining_amount,
            'progress' => $vault->progress,
            'status' => $vault->status->value,
            'statusLabel' => $vault->status->label(),
            'statusDescription' => $vault->status->description(),
            'statusTone' => $vault->status->tone(),
            'article' => $vault->variant?->fullLabel(),
        ];
    }
}
