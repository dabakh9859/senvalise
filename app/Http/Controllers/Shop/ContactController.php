<?php

namespace App\Http\Controllers\Shop;

use App\Http\Controllers\Controller;
use App\Models\ContactMessage;
use App\Models\Customer;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class ContactController extends Controller
{
    public function show(): Response
    {
        $customer = Auth::guard('client')->user();

        return Inertia::render('boutique/contact', [
            'shop' => [
                'name' => Setting::get('shop_name', 'SenValise'),
                'phone' => Setting::get('shop_phone', ''),
                'email' => Setting::get('shop_email', ''),
                'address' => Setting::get('shop_address', ''),
            ],
            'customer' => $customer instanceof Customer ? [
                'name' => $customer->displayName(),
                'phone' => $customer->phone,
                'email' => $customer->email,
            ] : null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:180'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:180'],
            'subject' => ['nullable', 'string', 'max:180'],
            'body' => ['required', 'string', 'max:3000'],
        ], [
            'body.required' => 'Écrivez votre message.',
        ]);

        $customer = Auth::guard('client')->user();

        ContactMessage::create([
            ...$validated,
            'customer_id' => $customer instanceof Customer ? $customer->id : null,
            'status' => 'nouveau',
        ]);

        $this->toast('Message envoyé. Nous vous répondrons rapidement.');

        return back();
    }
}
