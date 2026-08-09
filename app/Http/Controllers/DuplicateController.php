<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Services\DuplicateFinder;
use App\Services\MergeService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * Fiches saisies en double.
 *
 * On repère les groupes suspects, le gérant désigne la fiche à conserver, et
 * tout ce qui était rattaché aux autres bascule dessus.
 */
class DuplicateController extends Controller
{
    public function __construct(
        private readonly DuplicateFinder $finder,
        private readonly MergeService $merge,
    ) {}

    public function index(Request $request): Response
    {
        $kind = $request->string('type')->toString() ?: 'produits';

        $groups = match ($kind) {
            'clients' => $this->finder->customers(),
            'categories' => $this->finder->categories(),
            default => $this->finder->products(),
        };

        return Inertia::render('doublons/index', [
            'kind' => $kind,
            'groups' => $groups,
            'counts' => [
                'produits' => count($this->finder->products()),
                'clients' => count($this->finder->customers()),
                'categories' => count($this->finder->categories()),
            ],
        ]);
    }

    public function merge(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in(['produits', 'clients', 'categories'])],
            'target_id' => ['required', 'integer'],
            'source_ids' => ['required', 'array', 'min:1'],
            'source_ids.*' => ['integer'],
        ], [
            'source_ids.required' => 'Choisissez au moins une fiche à fusionner.',
        ]);

        try {
            [$label, $summary] = match ($validated['type']) {
                'clients' => $this->mergeCustomers($validated),
                'categories' => $this->mergeCategories($validated),
                default => $this->mergeProducts($validated),
            };
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        ActivityLog::record('fusion', $label);
        $this->toast($summary);

        return to_route('duplicates.index', ['type' => $validated['type']]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: string, 1: string}
     */
    protected function mergeProducts(array $data): array
    {
        $target = Product::whereKey((int) $data['target_id'])->firstOrFail();
        $result = $this->merge->products($target, $data['source_ids']);

        $parts = [];

        if ($result['merged_variants'] > 0) {
            $parts[] = "{$result['merged_variants']} déclinaison(s) regroupée(s)";
        }

        if ($result['moved_variants'] > 0) {
            $parts[] = "{$result['moved_variants']} déplacée(s)";
        }

        if ($result['moved_stock'] > 0) {
            $parts[] = "{$result['moved_stock']} article(s) de stock transféré(s)";
        }

        return [
            'Produits fusionnés vers '.$target->name,
            "Fusion terminée vers « {$target->name} »"
                .($parts === [] ? '.' : ' : '.implode(', ', $parts).'.'),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: string, 1: string}
     */
    protected function mergeCustomers(array $data): array
    {
        $target = Customer::whereKey((int) $data['target_id'])->firstOrFail();
        $result = $this->merge->customers($target, $data['source_ids']);

        return [
            'Clients fusionnés vers '.$target->displayName(),
            "Fusion terminée vers « {$target->displayName()} » : "
                ."{$result['sales']} vente(s), {$result['documents']} document(s) "
                ."et {$result['messages']} message(s) transférés.",
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: string, 1: string}
     */
    protected function mergeCategories(array $data): array
    {
        $target = Category::whereKey((int) $data['target_id'])->firstOrFail();
        $result = $this->merge->categories($target, $data['source_ids']);

        return [
            'Catégories fusionnées vers '.$target->name,
            "Fusion terminée vers « {$target->name} » : "
                ."{$result['products']} produit(s) transféré(s).",
        ];
    }
}
