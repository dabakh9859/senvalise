<?php

namespace App\Http\Middleware;

use App\Http\Controllers\ShopSettingsController;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Setting;
use App\Services\Shop\CartService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user('web');

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $user,
                'isGerant' => (bool) $user?->isGerant(),
                'roleLabel' => $user?->role?->label(),
            ],
            'shop' => [
                'name' => Setting::get('shop_name', 'SenValise'),
                'logo' => ShopSettingsController::logoUrl(),
                'phone' => Setting::get('shop_phone'),
                'address' => Setting::get('shop_address'),
                'currency' => Money::CURRENCY,
            ],
            // La boutique en ligne : nombre d'articles au panier et client
            // connecté. Partagé partout pour que l'en-tête public n'ait pas à
            // être alimenté page par page.
            'boutique' => [
                'panier' => app(CartService::class)->count(),
                'client' => ($client = $request->user('client')) instanceof Customer ? [
                    'name' => $client->displayName(),
                    'firstName' => Str::before($client->name, ' '),
                ] : null,
            ],
            // Pastille « stock bas » de la barre latérale. Requête légère et
            // uniquement pour un utilisateur connecté.
            'alerts' => fn () => $user ? [
                'lowStock' => ProductVariant::query()->active()->lowStock()->count(),
            ] : ['lowStock' => 0],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
