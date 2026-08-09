<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call(SettingsSeeder::class);
        $this->call(MessageTemplateSeeder::class);
        $this->call(DeliveryZoneSeeder::class);

        User::firstOrCreate(
            ['email' => 'gerant@senvalise.sn'],
            [
                'name' => 'Gérant SenValise',
                'password' => Hash::make('mot-de-passe-retire'),
                'role' => UserRole::Gerant->value,
                'phone' => '77 885 83 74',
                'is_active' => true,
                'email_verified_at' => now(),
            ],
        );

        User::firstOrCreate(
            ['email' => 'vendeur@senvalise.sn'],
            [
                'name' => 'Vendeur',
                'password' => Hash::make('mot-de-passe-retire'),
                'role' => UserRole::Vendeur->value,
                'is_active' => true,
                'email_verified_at' => now(),
            ],
        );
    }
}
