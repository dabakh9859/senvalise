<?php

namespace App\Http\Controllers\Shop;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Inscription et connexion des clients de la boutique.
 *
 * Une subtilité qui compte : un client peut déjà exister dans le fichier de la
 * boutique — il a acheté au comptoir, le gérant a saisi son nom. S'inscrire en
 * ligne ne doit pas créer un doublon, mais **rattacher un mot de passe à la
 * fiche existante**. C'est ce qui permet à un client de retrouver en ligne les
 * factures d'un achat fait au comptoir.
 */
class ClientAuthController extends Controller
{
    public function showLogin(): Response
    {
        return Inertia::render('boutique/connexion');
    }

    public function login(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'identifiant' => ['required', 'string', 'max:180'],
            'password' => ['required', 'string'],
            'remember' => ['boolean'],
        ], [
            'identifiant.required' => 'Indiquez votre e-mail ou votre téléphone.',
        ]);

        $customer = $this->findByIdentifier($validated['identifiant']);

        if (! $customer || ! $customer->hasWebAccount()
            || ! Hash::check($validated['password'], (string) $customer->password)) {
            throw ValidationException::withMessages([
                // Un seul message pour les deux cas : dire « ce compte
                // n'existe pas » révélerait qui est client de la boutique.
                'identifiant' => 'Identifiants incorrects.',
            ]);
        }

        if (! $customer->is_active) {
            throw ValidationException::withMessages([
                'identifiant' => 'Ce compte est désactivé. Contactez la boutique.',
            ]);
        }

        Auth::guard('client')->login($customer, (bool) ($validated['remember'] ?? false));
        $request->session()->regenerate();

        $customer->forceFill(['last_login_at' => now()])->save();

        return to_route('boutique.espace');
    }

    public function showRegister(): Response
    {
        return Inertia::render('boutique/inscription');
    }

    public function register(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:180'],
            'phone' => ['required', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:180'],
            'city' => ['nullable', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'whatsapp_opt_in' => ['boolean'],
        ]);

        // On cherche d'abord une fiche existante : le client a peut-être déjà
        // acheté au comptoir.
        $customer = $this->findByIdentifier($validated['email'] ?? '')
            ?? $this->findByIdentifier($validated['phone']);

        if ($customer?->hasWebAccount()) {
            throw ValidationException::withMessages([
                'email' => 'Un compte existe déjà avec ces coordonnées. Connectez-vous.',
            ]);
        }

        $attributes = [
            'type' => 'particulier',
            'name' => $validated['name'],
            'phone' => $validated['phone'],
            'email' => $validated['email'] ?? null,
            'city' => $validated['city'] ?? null,
            'address' => $validated['address'] ?? null,
            'password' => $validated['password'],
            'is_active' => true,
        ];

        if (($validated['whatsapp_opt_in'] ?? false) === true) {
            $attributes['whatsapp_opt_in_at'] = now();
        }

        if ($customer) {
            $customer->update($attributes);
        } else {
            $customer = Customer::create($attributes);
        }

        Auth::guard('client')->login($customer);
        $request->session()->regenerate();

        $this->toast('Bienvenue chez SenValise !');

        return to_route('boutique.espace');
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::guard('client')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return to_route('boutique.accueil');
    }

    /**
     * Retrouve un client par e-mail ou par téléphone.
     *
     * Le téléphone est comparé sur ses neuf derniers chiffres : « 77 885 83 74 »
     * et « +221778858374 » désignent la même personne.
     */
    protected function findByIdentifier(string $identifier): ?Customer
    {
        $identifier = trim($identifier);

        if ($identifier === '') {
            return null;
        }

        if (str_contains($identifier, '@')) {
            return Customer::where('email', $identifier)->first();
        }

        $digits = (string) preg_replace('/\D/', '', $identifier);
        $tail = mb_substr($digits, -9);

        if ($tail === '') {
            return null;
        }

        return Customer::query()
            ->whereNotNull('phone')
            ->get()
            ->first(function (Customer $customer) use ($tail): bool {
                $stored = (string) preg_replace('/\D/', '', (string) $customer->phone);

                return $stored !== '' && str_ends_with($stored, $tail);
            });
    }
}
