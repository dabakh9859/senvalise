<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_root_url_sends_visitors_to_the_online_shop()
    {
        $this->get(route('home'))->assertRedirect(route('boutique.accueil'));
    }

    public function test_the_root_url_sends_signed_in_users_to_the_dashboard()
    {
        $this->actingAs(User::factory()->create());

        $this->get(route('home'))->assertRedirect(route('dashboard'));
    }

    public function test_public_registration_is_disabled()
    {
        // L'application est interne : les comptes sont créés par le gérant.
        $this->assertFalse($this->app['router']->has('register'));
    }
}
