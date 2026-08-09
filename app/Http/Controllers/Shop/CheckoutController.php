<?php

namespace App\Http\Controllers\Shop;

use App\Enums\PaymentMethod;
use App\Enums\VaultStatus;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Models\Vault;
use App\Services\Shop\CartService;
use App\Services\Shop\GeolocationService;
use App\Services\Shop\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

/**
 * Panier, commande et suivi.
 *
 * La commande sans compte est un choix, pas un oubli : beaucoup de clients ne
 * créeront jamais de compte, et les obliger à s'inscrire pour acheter une
 * valise revient à perdre la vente. Le suivi reste accessible par un lien
 * porteur d'un jeton aléatoire.
 */
class CheckoutController extends Controller
{
    public function __construct(
        private readonly CartService $cart,
        private readonly OrderService $orders,
        private readonly GeolocationService $geo,
    ) {}

    public function cart(): Response
    {
        return Inertia::render('boutique/panier', [
            'cart' => $this->cart->contents(),
            'zones' => $this->zones(),
        ]);
    }

    public function add(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $this->cart->add($validated['variant_id'], $validated['quantity'] ?? 1);
        $this->toast('Article ajouté à votre panier.');

        return back();
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'variant_id' => ['required', 'integer'],
            'quantity' => ['required', 'integer', 'min:0', 'max:20'],
        ]);

        $this->cart->setQuantity($validated['variant_id'], $validated['quantity']);

        return back();
    }

    public function remove(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'variant_id' => ['required', 'integer'],
        ]);

        $this->cart->remove($validated['variant_id']);

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Commande
    |--------------------------------------------------------------------------
    */

    public function checkout(): Response|RedirectResponse
    {
        if ($this->cart->isEmpty()) {
            return to_route('boutique.panier');
        }

        $customer = $this->customer();

        return Inertia::render('boutique/commande', [
            'cart' => $this->cart->contents(),
            'zones' => $this->zones(),
            'paymentMethods' => $this->paymentMethods(),
            'customer' => $customer ? [
                'name' => $customer->displayName(),
                'phone' => $customer->phone,
                'email' => $customer->email,
                'address' => $customer->address,
                'city' => $customer->city,
                // Position déjà consentie : on la repropose plutôt que de
                // redemander l'autorisation à chaque commande.
                'latitude' => $customer->hasLocation() ? $customer->latitude : null,
                'longitude' => $customer->hasLocation() ? $customer->longitude : null,
                'locationAccuracy' => $customer->hasLocation() ? $customer->location_accuracy : null,
            ] : null,
            // Coffres utilisables : objectif atteint et pas encore dépensé.
            'vaults' => $customer
                ? $customer->vaults()
                    ->where('status', VaultStatus::Atteint->value)
                    ->get()
                    ->map(fn (Vault $vault) => [
                        'id' => $vault->id,
                        'reference' => $vault->reference,
                        'label' => $vault->label,
                        'saved' => $vault->saved_amount,
                    ])
                    ->all()
                : [],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'customer_name' => ['required', 'string', 'max:180'],
            'customer_phone' => ['required', 'string', 'max:40'],
            'customer_email' => ['nullable', 'email', 'max:180'],
            'delivery_address' => ['required', 'string', 'max:255'],
            'delivery_city' => ['nullable', 'string', 'max:120'],
            'delivery_note' => ['nullable', 'string', 'max:255'],
            'delivery_zone_id' => ['required', 'integer', 'exists:delivery_zones,id'],
            'payment_method' => ['required', Rule::enum(PaymentMethod::class)],
            'vault_id' => ['nullable', 'integer', 'exists:vaults,id'],
            'note' => ['nullable', 'string', 'max:500'],
            // Position facultative : le client qui refuse commande comme avant.
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'location_accuracy' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ], [
            'delivery_zone_id.required' => 'Choisissez votre zone de livraison.',
        ]);

        $customer = $this->customer();
        $vault = filled($validated['vault_id'] ?? null)
            ? Vault::whereKey((int) $validated['vault_id'])->first()
            : null;

        $latitude = isset($validated['latitude']) ? (float) $validated['latitude'] : null;
        $longitude = isset($validated['longitude']) ? (float) $validated['longitude'] : null;

        if (! $this->geo->isValid($latitude, $longitude)) {
            $latitude = null;
            $longitude = null;
            unset($validated['location_accuracy']);
        }

        $validated['latitude'] = $latitude;
        $validated['longitude'] = $longitude;

        /*
         * Le client connecté qui partage sa position la garde pour la
         * prochaine fois. C'est lui qui vient de l'accorder : la mémoriser
         * est le sens même de son geste, et il peut l'effacer depuis son
         * espace.
         */
        if ($customer !== null && $latitude !== null && $longitude !== null) {
            $customer->forceFill([
                'latitude' => $latitude,
                'longitude' => $longitude,
                'location_accuracy' => $validated['location_accuracy'] ?? null,
                'located_at' => now(),
                'location_consent_at' => $customer->location_consent_at ?? now(),
            ])->save();
        }

        try {
            $order = $this->orders->place(
                details: $validated,
                customer: $customer,
                zone: DeliveryZone::whereKey((int) $validated['delivery_zone_id'])->first(),
                vault: $vault,
            );
        } catch (Throwable $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        return to_route('boutique.suivi', ['token' => $order->tracking_token]);
    }

    /** Page de recherche, pour qui a perdu son lien de suivi. */
    public function lookup(): Response
    {
        return Inertia::render('boutique/suivi-recherche');
    }

    /**
     * Quelle zone de livraison correspond à cette position ?
     *
     * Appelée dès que le client accepte d'être localisé, pour lui éviter de
     * chercher son quartier dans une liste. La réponse reste une
     * **proposition** : elle présélectionne, elle n'impose pas. Hors de
     * portée, on ne répond rien plutôt que de suggérer une zone fausse avec
     * aplomb.
     */
    public function nearestZone(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $latitude = (float) $validated['latitude'];
        $longitude = (float) $validated['longitude'];

        if (! $this->geo->isValid($latitude, $longitude)) {
            return response()->json(['zone' => null]);
        }

        $match = $this->geo->suggestZone($latitude, $longitude);

        if ($match === null) {
            return response()->json(['zone' => null]);
        }

        return response()->json([
            'zone' => [
                'id' => $match['zone']->id,
                'name' => $match['zone']->name,
                'fee' => $match['zone']->fee,
                'covers' => $match['covers'],
                'distanceKm' => round($match['distance'], 1),
            ],
        ]);
    }

    /**
     * Suivi de commande par jeton.
     *
     * Volontairement public : le lien envoyé au client doit fonctionner sans
     * compte, depuis n'importe quel téléphone. Le jeton est aléatoire, donc
     * indevinable — contrairement au numéro de commande.
     */
    public function track(string $token): Response
    {
        $order = Order::with(['items', 'zone'])
            ->where('tracking_token', $token)
            ->firstOrFail();

        return Inertia::render('boutique/suivi', [
            'order' => $this->serialize($order),
        ]);
    }

    /** Recherche du suivi par numéro + téléphone, pour qui a perdu son lien. */
    public function find(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'reference' => ['required', 'string', 'max:40'],
            'phone' => ['required', 'string', 'max:40'],
        ]);

        $digits = (string) preg_replace('/\D/', '', $validated['phone']);

        $order = Order::query()
            ->where('reference', trim($validated['reference']))
            ->get()
            ->first(function (Order $candidate) use ($digits): bool {
                $stored = (string) preg_replace('/\D/', '', $candidate->customer_phone);

                return $stored !== '' && $digits !== '' && str_ends_with($stored, mb_substr($digits, -9));
            });

        if (! $order) {
            $this->toast('Aucune commande ne correspond à ce numéro et ce téléphone.', 'error');

            return back();
        }

        return to_route('boutique.suivi', ['token' => $order->tracking_token]);
    }

    /*
    |--------------------------------------------------------------------------
    | Assistants
    |--------------------------------------------------------------------------
    */

    protected function customer(): ?Customer
    {
        $customer = Auth::guard('client')->user();

        return $customer instanceof Customer ? $customer : null;
    }

    /** @return array<int, array<string, mixed>> */
    protected function zones(): array
    {
        return DeliveryZone::active()
            ->get()
            ->map(fn (DeliveryZone $zone) => [
                'id' => $zone->id,
                'name' => $zone->name,
                'city' => $zone->city,
                'fee' => $zone->fee,
                'delayLabel' => $zone->delayLabel(),
                'note' => $zone->note,
            ])
            ->all();
    }

    /**
     * Moyens de paiement proposés en ligne.
     *
     * L'application n'encaisse pas : elle enregistre ce que le client s'engage
     * à payer. Le règlement se fait à la livraison ou en boutique, ce qui reste
     * la norme ici — et évite d'exiger une passerelle de paiement pour ouvrir
     * la boutique.
     *
     * @return array<int, array{value: string, label: string}>
     */
    protected function paymentMethods(): array
    {
        return array_map(
            fn (PaymentMethod $method) => [
                'value' => $method->value,
                'label' => $method->label(),
            ],
            [
                PaymentMethod::Especes,
                PaymentMethod::Wave,
                PaymentMethod::OrangeMoney,
                PaymentMethod::FreeMoney,
            ],
        );
    }

    /** @return array<string, mixed> */
    protected function serialize(Order $order): array
    {
        return [
            'reference' => $order->reference,
            'status' => $order->status->value,
            'statusLabel' => $order->status->customerLabel(),
            'statusDescription' => $order->status->description(),
            'step' => $order->status->step(),
            'placedAt' => $order->placed_at?->toIso8601String(),
            'confirmedAt' => $order->confirmed_at?->toIso8601String(),
            'shippedAt' => $order->shipped_at?->toIso8601String(),
            'deliveredAt' => $order->delivered_at?->toIso8601String(),
            'cancelReason' => $order->cancel_reason,
            'customerName' => $order->customer_name,
            'customerPhone' => $order->customer_phone,
            'address' => $order->delivery_address,
            'city' => $order->delivery_city,
            'zone' => $order->zone?->name,
            'delayLabel' => $order->zone?->delayLabel(),
            'subtotal' => $order->subtotal,
            'deliveryFee' => $order->delivery_fee,
            'total' => $order->total,
            'amountPaid' => $order->amount_paid,
            'balanceDue' => $order->balance_due,
            'paymentLabel' => $order->payment_method->label(),
            'items' => $order->items->map(fn ($item) => [
                'designation' => $item->designation,
                'quantity' => $item->quantity,
                'unitPrice' => $item->unit_price,
                'lineTotal' => $item->line_total,
            ])->all(),
        ];
    }
}
