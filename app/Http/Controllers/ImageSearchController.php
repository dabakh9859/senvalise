<?php

namespace App\Http\Controllers;

use App\Services\ImageSearchService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * Relais de recherche d'images.
 *
 * Le navigateur interroge cette route ; c'est le serveur qui appelle SerpAPI
 * avec la clé. Elle ne quitte jamais la machine.
 */
class ImageSearchController extends Controller
{
    public function __construct(private readonly ImageSearchService $search) {}

    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:120'],
        ]);

        if (! $this->search->isConfigured()) {
            return response()->json([
                'configured' => false,
                'message' => "La recherche d'images n'est pas configurée. Renseignez la clé dans Réglages → Intégrations.",
                'results' => [],
            ], 200);
        }

        try {
            $results = $this->search->search($validated['q']);
        } catch (Throwable $e) {
            return response()->json([
                'configured' => true,
                'message' => $e->getMessage(),
                'results' => [],
            ], 200);
        }

        return response()->json([
            'configured' => true,
            'message' => null,
            'results' => $results,
        ]);
    }
}
