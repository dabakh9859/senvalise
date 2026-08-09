<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Réserve une route au gérant. Le vendeur garde l'accès à la caisse, aux
 * clients et à la consultation du stock, mais pas aux prix d'achat, aux
 * arrivages ni aux réglages.
 */
class EnsureUserIsGerant
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user('web')?->isGerant(), 403, 'Cette section est réservée au gérant.');

        return $next($request);
    }
}
