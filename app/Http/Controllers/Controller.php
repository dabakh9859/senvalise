<?php

namespace App\Http\Controllers;

use Inertia\Inertia;

abstract class Controller
{
    /**
     * Affiche une notification après l'action (toast en haut de l'écran).
     *
     * Passe par le flash d'Inertia et non par la session Laravel : le hook
     * front `useFlashToast` écoute l'évènement `flash` d'Inertia.
     */
    protected function toast(string $message, string $type = 'success'): void
    {
        Inertia::flash('toast', ['type' => $type, 'message' => $message]);
    }
}
