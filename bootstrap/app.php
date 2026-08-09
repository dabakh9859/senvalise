<?php

use App\Http\Middleware\EnsureUserIsGerant;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        // Meta n'a pas de session sur notre site : il ne peut pas porter de
        // jeton CSRF. La signature HMAC de chaque appel le remplace.
        $middleware->validateCsrfTokens(except: ['webhooks/whatsapp']);

        $middleware->web(append: [
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'gerant' => EnsureUserIsGerant::class,
        ]);

        /*
        |----------------------------------------------------------------------
        | Chacun chez soi
        |----------------------------------------------------------------------
        |
        | Deux gardes cohabitent, donc deux mondes. Sans ces deux règles,
        | Laravel renvoie tout le monde vers les écrans du personnel : un
        | client qui clique sur « Le coffre » sans être connecté atterrissait
        | sur la page de connexion du logiciel de gestion, et un client déjà
        | connecté qui revenait sur « Se connecter » était envoyé au tableau
        | de bord de la boutique physique.
        |
        | On tranche sur l'adresse demandée : ce qui commence par « boutique »
        | reste dans la boutique.
        */
        $middleware->redirectGuestsTo(
            fn (Request $request): string => $request->is('boutique', 'boutique/*')
                ? route('boutique.connexion')
                : route('login'),
        );

        $middleware->redirectUsersTo(
            fn (Request $request): string => $request->is('boutique', 'boutique/*')
                ? route('boutique.espace')
                : route('dashboard'),
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
