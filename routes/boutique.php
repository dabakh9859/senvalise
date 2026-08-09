<?php

use App\Http\Controllers\Shop\CatalogController;
use App\Http\Controllers\Shop\CheckoutController;
use App\Http\Controllers\Shop\ClientAreaController;
use App\Http\Controllers\Shop\ClientAuthController;
use App\Http\Controllers\Shop\ContactController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| La boutique en ligne
|--------------------------------------------------------------------------
|
| Tout est public sauf l'espace client. Volontairement : obliger un visiteur à
| créer un compte pour acheter une valise revient à perdre la vente. Le suivi
| de commande fonctionne lui aussi sans compte, par un lien porteur d'un jeton
| aléatoire.
|
| Aucune de ces routes ne passe par le middleware d'administration : un
| acheteur ne peut atteindre aucun écran de gestion.
*/

Route::prefix('boutique')->name('boutique.')->group(function () {
    Route::get('/', [CatalogController::class, 'home'])->name('accueil');
    Route::get('catalogue', [CatalogController::class, 'index'])->name('catalogue');
    Route::get('produit/{slug}', [CatalogController::class, 'show'])->name('produit');
    // Publique : « Le coffre » est une promesse du menu, pas une page réservée.
    Route::get('coffre', [CatalogController::class, 'vault'])->name('coffre');

    Route::get('panier', [CheckoutController::class, 'cart'])->name('panier');
    Route::post('panier', [CheckoutController::class, 'add'])->name('panier.ajouter');
    Route::put('panier', [CheckoutController::class, 'update'])->name('panier.modifier');
    Route::delete('panier', [CheckoutController::class, 'remove'])->name('panier.retirer');

    Route::get('commande', [CheckoutController::class, 'checkout'])->name('commande');
    // Suggestion de zone à partir d'une position partagée par le client.
    Route::post('commande/zone-proche', [CheckoutController::class, 'nearestZone'])
        ->middleware('throttle:30,1')->name('commande.zone');
    // Limité : un formulaire public qui crée des enregistrements se doit de
    // l'être, même sans mauvaise intention derrière.
    Route::post('commande', [CheckoutController::class, 'store'])
        ->middleware('throttle:10,1')->name('commande.valider');

    Route::get('suivi', [CheckoutController::class, 'lookup'])->name('suivi.recherche');
    Route::get('suivi/{token}', [CheckoutController::class, 'track'])->name('suivi');
    Route::post('suivi', [CheckoutController::class, 'find'])
        ->middleware('throttle:15,1')->name('suivi.chercher');

    Route::get('contact', [ContactController::class, 'show'])->name('contact');
    Route::post('contact', [ContactController::class, 'store'])
        ->middleware('throttle:5,1')->name('contact.envoyer');

    /*
    |--------------------------------------------------------------------------
    | Compte client
    |--------------------------------------------------------------------------
    */
    Route::middleware('guest:client')->group(function () {
        Route::get('connexion', [ClientAuthController::class, 'showLogin'])->name('connexion');
        Route::post('connexion', [ClientAuthController::class, 'login'])
            ->middleware('throttle:10,1')->name('connexion.valider');
        Route::get('inscription', [ClientAuthController::class, 'showRegister'])->name('inscription');
        Route::post('inscription', [ClientAuthController::class, 'register'])
            ->middleware('throttle:5,1')->name('inscription.valider');
    });

    Route::post('deconnexion', [ClientAuthController::class, 'logout'])->name('deconnexion');

    Route::middleware('auth:client')->prefix('espace')->name('espace')->group(function () {
        Route::get('/', [ClientAreaController::class, 'index']);
        Route::get('commandes', [ClientAreaController::class, 'orders'])->name('.commandes');
        Route::post('commandes/{order}/annuler', [ClientAreaController::class, 'cancelOrder'])->name('.commandes.annuler');

        Route::get('coffres', [ClientAreaController::class, 'vaults'])->name('.coffres');
        Route::post('coffres', [ClientAreaController::class, 'openVault'])->name('.coffres.ouvrir');

        Route::get('profil', [ClientAreaController::class, 'profile'])->name('.profil');
        Route::put('profil', [ClientAreaController::class, 'updateProfile'])->name('.profil.modifier');
        // Un consentement qu'on ne peut pas retirer n'en est pas un.
        Route::delete('position', [ClientAreaController::class, 'forgetLocation'])->name('.position.oublier');
    });
});
