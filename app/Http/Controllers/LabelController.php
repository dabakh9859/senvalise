<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\ProductVariant;
use App\Models\Setting;
use App\Support\Barcode;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Impression des étiquettes code-barres.
 *
 * On choisit les articles, la quantité d'étiquettes par article, puis on
 * génère une planche imprimable au format papier voulu. L'impression se fait
 * depuis le navigateur : pas de pilote ni de logiciel supplémentaire à
 * installer sur le poste de la boutique.
 */
class LabelController extends Controller
{
    /** Formats de planche proposés (dimensions en millimètres). */
    public const FORMATS = [
        'a4-3x8' => [
            'label' => 'A4 — 24 étiquettes (70 × 37 mm)',
            'page' => 'A4',
            'columns' => 3,
            'width' => 70,
            'height' => 37,
            'gap' => 0,
            'padding' => 8,
        ],
        'a4-4x10' => [
            'label' => 'A4 — 40 étiquettes (48,5 × 25,4 mm)',
            'page' => 'A4',
            'columns' => 4,
            'width' => 48.5,
            'height' => 25.4,
            'gap' => 0,
            'padding' => 6,
        ],
        'a4-2x7' => [
            'label' => 'A4 — 14 grandes étiquettes (99 × 38 mm)',
            'page' => 'A4',
            'columns' => 2,
            'width' => 99,
            'height' => 38,
            'gap' => 0,
            'padding' => 10,
        ],
        'rouleau-40x30' => [
            'label' => 'Rouleau thermique — 40 × 30 mm',
            'page' => '40mm 30mm',
            'columns' => 1,
            'width' => 40,
            'height' => 30,
            'gap' => 0,
            'padding' => 2,
        ],
    ];

    public function index(Request $request): Response
    {
        $variants = ProductVariant::query()
            ->with('product:id,name,category_id')
            ->active()
            ->search($request->string('recherche')->toString())
            ->when($request->filled('categorie'), fn ($q) => $q->whereHas(
                'product',
                fn ($p) => $p->where('category_id', $request->integer('categorie')),
            ))
            ->when($request->string('etat')->toString() === 'sans-code', fn ($q) => $q->whereNull('barcode'))
            ->orderBy('product_id')
            ->orderBy('position')
            ->paginate(30)
            ->withQueryString()
            ->through(fn (ProductVariant $variant) => [
                'id' => $variant->id,
                'label' => $variant->fullLabel(),
                'sku' => $variant->sku,
                'barcode' => $variant->barcode,
                'barcodeReadable' => $variant->barcode ? Barcode::humanReadable($variant->barcode) : null,
                'price' => $variant->selling_price,
                'stock' => $variant->stock_quantity,
            ]);

        return Inertia::render('etiquettes/index', [
            'variants' => $variants,
            'filters' => $request->only(['recherche', 'categorie', 'etat']),
            'categories' => Category::orderBy('position')->get(['id', 'name']),
            'formats' => collect(self::FORMATS)
                ->map(fn (array $format, string $key) => [
                    'value' => $key,
                    'label' => $format['label'],
                    'perPage' => $format['columns'] * (int) floor(277 / $format['height']),
                ])
                ->values()
                ->all(),
        ]);
    }

    /**
     * Planche d'étiquettes prête à imprimer.
     *
     * Les identifiants passent en query string pour que la page s'ouvre dans
     * un nouvel onglet et reste rechargeable.
     */
    public function sheet(Request $request): View
    {
        $validated = $request->validate([
            'ids' => ['required', 'string'],
            'format' => ['nullable', 'string'],
            'quantites' => ['nullable', 'string'],
            'prix' => ['nullable', 'in:0,1'],
            'nom' => ['nullable', 'in:0,1'],
        ]);

        $formatKey = $validated['format'] ?? 'a4-3x8';
        $format = self::FORMATS[$formatKey] ?? self::FORMATS['a4-3x8'];

        $ids = collect(explode(',', $validated['ids']))
            ->map(fn ($id) => (int) trim($id))
            ->filter()
            ->unique()
            ->take(500)
            ->values();

        // « 12:3,15:10 » → 3 étiquettes pour la variante 12, 10 pour la 15.
        $quantities = collect(explode(',', $validated['quantites'] ?? ''))
            ->mapWithKeys(function ($pair) {
                [$id, $qty] = array_pad(explode(':', trim($pair)), 2, null);

                return [(int) $id => max(1, min(200, (int) $qty))];
            })
            ->filter(fn ($qty, $id) => $id > 0);

        // On conserve l'ordre de sélection : le tableau retourné par flip()
        // donne la position de chaque identifiant en un accès direct.
        $order = $ids->flip();

        $variants = ProductVariant::with('product:id,name')
            ->whereIn('id', $ids)
            ->get()
            ->sortBy(fn (ProductVariant $v): int => (int) ($order[$v->id] ?? PHP_INT_MAX));

        $labels = [];

        foreach ($variants as $variant) {
            $count = $quantities[$variant->id] ?? 1;

            for ($i = 0; $i < $count; $i++) {
                $labels[] = [
                    'name' => $variant->fullLabel(),
                    'sku' => $variant->sku,
                    'price' => $variant->selling_price,
                    'barcode' => $variant->barcode,
                    'svg' => $variant->barcode
                        ? Barcode::svg($variant->barcode, $format['width'] * 2.4, $format['height'] * 1.1)
                        : null,
                    'readable' => $variant->barcode ? Barcode::humanReadable($variant->barcode) : null,
                ];
            }
        }

        return view('print.labels', [
            'labels' => $labels,
            'format' => $format,
            'showPrice' => ($validated['prix'] ?? '1') === '1',
            'showName' => ($validated['nom'] ?? '1') === '1',
            'shopName' => Setting::get('shop_name', 'SenValise'),
        ]);
    }
}
