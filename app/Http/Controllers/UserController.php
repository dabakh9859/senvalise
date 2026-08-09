<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function index(Request $request): Response
    {
        $users = User::query()
            ->withCount(['sales' => fn ($q) => $q->where('status', 'validee')])
            ->orderBy('name')
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'role' => $user->role->value,
                'roleLabel' => $user->role->label(),
                'isActive' => $user->is_active,
                'salesCount' => (int) $user->sales_count,
                'isSelf' => $user->id === $request->user()->id,
                'createdAt' => $user->created_at?->toIso8601String(),
            ]);

        return Inertia::render('reglages/utilisateurs', [
            'users' => $users,
            'roles' => UserRole::options(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:40'],
            'role' => ['required', Rule::enum(UserRole::class)],
            'password' => ['required', Password::defaults()],
            'is_active' => ['boolean'],
        ]);

        $user = User::create([
            ...$validated,
            'password' => Hash::make($validated['password']),
            'email_verified_at' => now(),
        ]);

        ActivityLog::record('cree', "Utilisateur « {$user->name} » créé", $user);
        $this->toast('Utilisateur créé.');

        return back();
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:40'],
            'role' => ['required', Rule::enum(UserRole::class)],
            'password' => ['nullable', Password::defaults()],
            'is_active' => ['boolean'],
        ]);

        // Garde-fou : ne pas se retirer soi-même le rôle gérant ou son accès,
        // sinon plus personne ne peut administrer l'application.
        if ($user->id === $request->user()->id) {
            $validated['role'] = $user->role->value;
            $validated['is_active'] = true;
        }

        if ($user->isGerant() && $validated['role'] !== UserRole::Gerant->value && $this->lastActiveGerant($user)) {
            $this->toast('Impossible : il doit rester au moins un gérant actif.', 'error');

            return back();
        }

        $user->update([
            ...$validated,
            'password' => filled($validated['password'] ?? null)
                ? Hash::make($validated['password'])
                : $user->password,
        ]);

        ActivityLog::record('modifie', "Utilisateur « {$user->name} » modifié", $user);
        $this->toast('Utilisateur mis à jour.');

        return back();
    }

    public function destroy(Request $request, User $user): RedirectResponse
    {
        if ($user->id === $request->user()->id) {
            $this->toast('Vous ne pouvez pas supprimer votre propre compte ici.', 'error');

            return back();
        }

        if ($user->isGerant() && $this->lastActiveGerant($user)) {
            $this->toast('Impossible : il doit rester au moins un gérant actif.', 'error');

            return back();
        }

        // Un utilisateur qui a des ventes est désactivé, pas supprimé :
        // l'historique doit rester attribuable.
        if ($user->sales()->exists() || $user->stockMovements()->exists()) {
            $user->update(['is_active' => false]);
            $this->toast('Utilisateur désactivé (il a un historique).');

            return back();
        }

        $name = $user->name;
        $user->delete();

        ActivityLog::record('supprime', "Utilisateur « {$name} » supprimé");
        $this->toast('Utilisateur supprimé.');

        return back();
    }

    protected function lastActiveGerant(User $user): bool
    {
        return User::where('role', UserRole::Gerant->value)
            ->where('is_active', true)
            ->whereKeyNot($user->id)
            ->doesntExist();
    }
}
