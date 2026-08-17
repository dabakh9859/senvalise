<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call(SettingsSeeder::class);
        $this->call(MessageTemplateSeeder::class);
        $this->call(DeliveryZoneSeeder::class);

        $password = $this->startingPassword();

        $gerant = User::firstOrCreate(
            ['email' => 'gerant@senvalise.sn'],
            [
                'name' => 'Gérant SenValise',
                'password' => Hash::make($password),
                'role' => UserRole::Gerant->value,
                'phone' => '77 885 83 74',
                'is_active' => true,
                'email_verified_at' => now(),
            ],
        );

        $vendeur = User::firstOrCreate(
            ['email' => 'vendeur@senvalise.sn'],
            [
                'name' => 'Vendeur',
                'password' => Hash::make($password),
                'role' => UserRole::Vendeur->value,
                'is_active' => true,
                'email_verified_at' => now(),
            ],
        );

        // Annoncé seulement si un compte vient d'être créé : sur une base déjà
        // peuplée, firstOrCreate n'a rien changé et afficher un mot de passe
        // qui ne fonctionne pas ferait perdre un quart d'heure à quelqu'un.
        if ($this->generated && ($gerant->wasRecentlyCreated || $vendeur->wasRecentlyCreated)) {
            $this->command->warn("Mot de passe des comptes créés : {$password}");
            $this->command->warn('Notez-le, il ne sera plus affiché. Renseignez SEED_PASSWORD dans .env pour le choisir vous-même.');
        }
    }

    /** Vrai quand le mot de passe a été tiré au hasard plutôt que fourni. */
    protected bool $generated = false;

    /**
     * Mot de passe des deux comptes de démarrage.
     *
     * Lu dans SEED_PASSWORD, et tiré au hasard s'il est absent. Rien n'est
     * écrit en dur : ce dépôt est public, et un mot de passe par défaut publié
     * est un mot de passe qu'on retrouve un jour en production.
     */
    protected function startingPassword(): string
    {
        $fourni = trim((string) config('app.seed_password', ''));

        if ($fourni !== '') {
            return $fourni;
        }

        $this->generated = true;

        return Str::password(16, symbols: false);
    }
}
