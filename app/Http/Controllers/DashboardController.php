<?php

namespace App\Http\Controllers;

use App\Enums\DocumentStatus;
use App\Enums\DocumentType;
use App\Models\CashSession;
use App\Models\Document;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\StockService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    /** Périodes proposées, en jours. « 12 mois » bascule en pas mensuel. */
    private const PRESETS = [
        '7j' => 7,
        '30j' => 30,
        '90j' => 90,
        '12m' => 365,
    ];

    public function __construct(private readonly StockService $stock) {}

    public function index(Request $request): Response
    {
        $isGerant = $request->user('web')->isGerant();

        $preset = $request->string('periode')->toString();
        $preset = array_key_exists($preset, self::PRESETS) ? $preset : '30j';
        $days = self::PRESETS[$preset];

        $to = Carbon::today()->endOfDay();
        $from = Carbon::today()->subDays($days - 1)->startOfDay();
        $previousTo = $from->copy()->subSecond();
        $previousFrom = $from->copy()->subDays($days);

        $revenue = $this->revenue($from, $to);
        $previousRevenue = $this->revenue($previousFrom, $previousTo);

        return Inertia::render('dashboard', [
            'isGerant' => $isGerant,
            'quickActions' => $this->quickActions($isGerant),
            'period' => [
                'preset' => $preset,
                'label' => $this->periodLabel($from, $to),
                'previousLabel' => $this->previousLabel($preset),
                'options' => [
                    ['value' => '7j', 'label' => '7 jours'],
                    ['value' => '30j', 'label' => '30 jours'],
                    ['value' => '90j', 'label' => '90 jours'],
                    ['value' => '12m', 'label' => '12 mois'],
                ],
            ],
            'hero' => [
                'revenue' => $revenue,
                'delta' => $this->delta($revenue, $previousRevenue),
                'salesCount' => Sale::valid()->between($from, $to)->count(),
            ],
            'kpis' => $this->kpis($from, $to, $revenue, $isGerant),
            'daily' => $this->series($from, $to, $days > 120, $isGerant),
            'ageing' => $this->ageing(),
            'collection' => $this->collection($from, $to),
            'topProducts' => $this->topProducts($from, $to),
            'topCustomers' => $this->topCustomers($from, $to),
            'byCategory' => $this->byCategory($from, $to),
            'heatmap' => $this->heatmap($from, $to),
            'lowStock' => $this->lowStock(),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Accès rapides
    |--------------------------------------------------------------------------
    */

    /**
     * Les gestes que l'on vient faire ici sans reflechir, ranges par frequence
     * reelle au comptoir et non par importance dans l'organigramme.
     *
     * Le vendeur ne voit que ce qu'il a le droit d'ouvrir : proposer un bouton
     * qui mene a un 403 est pire que ne rien proposer.
     *
     * L'icone est envoyee par son nom et resolue cote React, ou vit la
     * bibliotheque d'icones.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function quickActions(bool $isGerant): array
    {
        $cashOpen = CashSession::current() !== null;

        $actions = [
            [
                'key' => 'vente',
                'label' => 'Encaisser une vente',
                'hint' => 'Comptoir et facture dans la foulée',
                'href' => '/documents?vente=1',
                'icon' => 'shopping-cart',
                'primary' => true,
            ],
            [
                'key' => 'caisse',
                'label' => $cashOpen ? 'Voir la caisse' : 'Ouvrir la caisse',
                'hint' => $cashOpen ? 'Caisse ouverte' : 'Aucune caisse ouverte',
                'href' => '/caisse',
                'icon' => 'wallet',
                'primary' => ! $cashOpen,
            ],
            [
                'key' => 'achat',
                'label' => 'Saisir un achat',
                'hint' => 'Dépense ou marchandise du jour',
                'href' => '/achats',
                'icon' => 'banknote',
            ],
            [
                'key' => 'retour',
                'label' => 'Enregistrer un retour',
                'hint' => 'Marchandise rendue par un client',
                'href' => '/retours/nouveau',
                'icon' => 'rotate-ccw',
            ],
            [
                'key' => 'client',
                'label' => 'Fiches clients',
                'hint' => 'Historique, impayés, avoirs',
                'href' => '/clients',
                'icon' => 'users',
            ],
            [
                'key' => 'facture',
                'label' => 'Devis et documents',
                'hint' => 'Devis, facture ou bon de livraison',
                'href' => '/documents/nouveau',
                'icon' => 'file-text',
            ],
            [
                'key' => 'stock',
                'label' => 'Consulter le stock',
                'hint' => 'Quantités et alertes',
                'href' => '/stock',
                'icon' => 'warehouse',
            ],
        ];

        if ($isGerant) {
            $actions[] = [
                'key' => 'produit',
                'label' => 'Ajouter un produit',
                'hint' => 'Nouvelle référence au catalogue',
                'href' => '/produits/nouveau',
                'icon' => 'package-plus',
            ];
            $actions[] = [
                'key' => 'arrivage',
                'label' => 'Saisir un arrivage',
                'hint' => 'Réception fournisseur',
                'href' => '/arrivages/nouveau',
                'icon' => 'truck',
            ];
            $actions[] = [
                'key' => 'commandes',
                'label' => 'Commandes en ligne',
                'hint' => 'Préparation et suivi',
                'href' => '/commandes',
                'icon' => 'package-check',
            ];
            $actions[] = [
                'key' => 'rapports',
                'label' => 'Rapports',
                'hint' => 'Marges, exports comptables',
                'href' => '/rapports',
                'icon' => 'bar-chart',
            ];
        } else {
            $actions[] = [
                'key' => 'etiquettes',
                'label' => 'Imprimer des étiquettes',
                'hint' => 'Planche de codes-barres',
                'href' => '/etiquettes',
                'icon' => 'qr-code',
            ];
        }

        return $actions;
    }

    /*
    |--------------------------------------------------------------------------
    | Chiffres clés
    |--------------------------------------------------------------------------
    */

    /** @return array<int, array<string, mixed>> */
    protected function kpis(Carbon $from, Carbon $to, int $revenue, bool $isGerant): array
    {
        $sales = Sale::valid()->between($from, $to)->get(['total', 'amount_paid', 'total_cost']);

        // Une vente « à crédit » n'est pas encaissée : c'est là que se niche
        // l'écart entre ce qui est vendu et ce qui est en caisse.
        $collected = (int) $sales->sum(fn (Sale $sale) => min($sale->amount_paid, $sale->total));
        $outstanding = (int) $sales->sum(fn (Sale $sale) => max(0, $sale->total - $sale->amount_paid));
        $count = $sales->count();

        $lowStock = ProductVariant::active()->lowStock()->count();
        $outOfStock = ProductVariant::active()->where('stock_quantity', '<=', 0)->count();

        $kpis = [
            [
                'key' => 'collected',
                'label' => 'Encaissé',
                'value' => Money::format($collected),
                'hint' => $revenue > 0
                    ? round(($collected / $revenue) * 100).' % du chiffre d’affaires'
                    : 'Aucune vente sur la période',
                'tone' => 'success',
            ],
            [
                'key' => 'outstanding',
                'label' => 'Reste à encaisser',
                'value' => Money::format($outstanding),
                'hint' => 'Ventes à crédit de la période',
                'tone' => $outstanding > 0 ? 'warning' : 'default',
            ],
            [
                'key' => 'sales',
                'label' => 'Ventes',
                'value' => number_format($count, 0, ',', ' '),
                'hint' => $count > 0
                    ? 'Panier moyen '.Money::format((int) round($revenue / $count))
                    : 'Aucune vente',
                'tone' => 'default',
            ],
            [
                'key' => 'alerts',
                'label' => 'Stock en alerte',
                'value' => number_format($lowStock, 0, ',', ' '),
                'hint' => "{$outOfStock} en rupture, ".max(0, $lowStock - $outOfStock).' au plus bas',
                'tone' => $outOfStock > 0 ? 'danger' : ($lowStock > 0 ? 'warning' : 'default'),
            ],
        ];

        if ($isGerant) {
            $cost = (int) $sales->sum('total_cost');
            $margin = $revenue - $cost;

            $kpis[] = [
                'key' => 'margin',
                'label' => 'Marge dégagée',
                'value' => Money::format($margin),
                'hint' => $revenue > 0
                    ? 'Taux '.str_replace('.', ',', (string) round(($margin / $revenue) * 100, 1)).' %'
                    : '—',
                'tone' => 'success',
            ];
            $kpis[] = [
                'key' => 'stock',
                'label' => 'Valeur du stock',
                'value' => Money::format($this->stock->totalStockValue()),
                'hint' => Money::format($this->stock->totalRetailValue()).' au prix de vente',
                'tone' => 'default',
            ];
        } else {
            $kpis[] = [
                'key' => 'articles',
                'label' => 'Articles en stock',
                'value' => number_format((int) ProductVariant::active()->sum('stock_quantity'), 0, ',', ' '),
                'hint' => 'Toutes tailles et couleurs',
                'tone' => 'default',
            ];
        }

        return $kpis;
    }

    /*
    |--------------------------------------------------------------------------
    | Séries
    |--------------------------------------------------------------------------
    */

    /**
     * Chiffre d'affaires et marge, jour par jour (ou mois par mois au-delà de
     * quatre mois : 365 points seraient illisibles).
     *
     * @return array<string, mixed>
     */
    protected function series(Carbon $from, Carbon $to, bool $monthly, bool $isGerant): array
    {
        $format = $monthly ? '%Y-%m' : '%Y-%m-%d';

        $rows = Sale::valid()
            ->between($from, $to)
            ->selectRaw("strftime('{$format}', sold_at) as bucket, sum(total) as revenue, sum(total_cost) as cost, count(*) as orders")
            ->groupBy('bucket')
            ->toBase()
            ->get()
            ->keyBy('bucket');

        $points = [];
        $cursor = $from->copy();

        while ($cursor->lessThanOrEqualTo($to)) {
            $key = $monthly ? $cursor->format('Y-m') : $cursor->toDateString();
            $row = $rows->get($key);
            $revenue = (int) ($row->revenue ?? 0);

            $points[] = [
                'date' => $key,
                'label' => $monthly
                    ? $cursor->translatedFormat('M y')
                    : $cursor->translatedFormat('j M'),
                'fullLabel' => $monthly
                    ? $cursor->translatedFormat('F Y')
                    : $cursor->translatedFormat('l j F'),
                'revenue' => $revenue,
                'margin' => $isGerant ? $revenue - (int) ($row->cost ?? 0) : null,
                'orders' => (int) ($row->orders ?? 0),
            ];

            $monthly ? $cursor->addMonthNoOverflow()->startOfMonth() : $cursor->addDay();
        }

        return [
            'points' => $points,
            'showMargin' => $isGerant,
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Créances et encaissement
    |--------------------------------------------------------------------------
    */

    /**
     * Impayés par ancienneté, toutes périodes confondues : une créance de
     * l'an dernier reste due aujourd'hui, elle doit rester visible même en
     * affichage « 7 jours ».
     *
     * @return array<string, mixed>
     */
    protected function ageing(): array
    {
        $buckets = [
            ['key' => '0-30', 'label' => '1 – 30 j', 'min' => 0, 'max' => 30, 'amount' => 0, 'count' => 0],
            ['key' => '31-60', 'label' => '31 – 60 j', 'min' => 31, 'max' => 60, 'amount' => 0, 'count' => 0],
            ['key' => '61-90', 'label' => '61 – 90 j', 'min' => 61, 'max' => 90, 'amount' => 0, 'count' => 0],
            ['key' => '90+', 'label' => 'Plus de 90 j', 'min' => 91, 'max' => PHP_INT_MAX, 'amount' => 0, 'count' => 0],
        ];

        $today = Carbon::today();

        $unpaid = Document::query()
            ->ofType(DocumentType::Facture)
            ->whereNotIn('status', [DocumentStatus::Paye->value, DocumentStatus::Annule->value])
            ->whereColumn('amount_paid', '<', 'total')
            ->get(['issue_date', 'due_date', 'total', 'amount_paid']);

        foreach ($unpaid as $document) {
            $reference = $document->due_date ?? $document->issue_date;
            $age = $reference ? max(0, (int) $reference->diffInDays($today, absolute: false)) : 0;
            $balance = $document->balance_due;

            foreach ($buckets as $index => $bucket) {
                if ($age >= $bucket['min'] && $age <= $bucket['max']) {
                    $buckets[$index]['amount'] += $balance;
                    $buckets[$index]['count']++;
                    break;
                }
            }
        }

        return [
            'buckets' => array_map(
                fn (array $bucket) => [
                    'key' => $bucket['key'],
                    'label' => $bucket['label'],
                    'amount' => $bucket['amount'],
                    'count' => $bucket['count'],
                ],
                $buckets,
            ),
            'total' => array_sum(array_column($buckets, 'amount')),
        ];
    }

    /**
     * Répartition des factures émises sur la période, par état de règlement.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function collection(Carbon $from, Carbon $to): array
    {
        $documents = Document::query()
            ->ofType(DocumentType::Facture)
            ->whereBetween('issue_date', [$from->toDateString(), $to->toDateString()])
            ->where('status', '!=', DocumentStatus::Annule->value)
            ->get(['total', 'amount_paid']);

        $states = [
            'paid' => ['label' => 'payée', 'tone' => 'good', 'count' => 0, 'amount' => 0],
            'partial' => ['label' => 'partiellement payée', 'tone' => 'warning', 'count' => 0, 'amount' => 0],
            'pending' => ['label' => 'en attente', 'tone' => 'critical', 'count' => 0, 'amount' => 0],
        ];

        foreach ($documents as $document) {
            $key = match (true) {
                $document->amount_paid >= $document->total && $document->total > 0 => 'paid',
                $document->amount_paid > 0 => 'partial',
                default => 'pending',
            };

            $states[$key]['count']++;
            $states[$key]['amount'] += $document->total;
        }

        return array_map(
            fn (array $state, string $key) => [...$state, 'key' => $key],
            $states,
            array_keys($states),
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Classements
    |--------------------------------------------------------------------------
    */

    /** @return array<int, array<string, mixed>> */
    protected function topProducts(Carbon $from, Carbon $to, int $limit = 8): array
    {
        return SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', 'validee')
            ->whereBetween('sales.sold_at', [$from, $to])
            ->leftJoin('product_variants', 'product_variants.id', '=', 'sale_items.product_variant_id')
            ->leftJoin('products', 'products.id', '=', 'product_variants.product_id')
            ->groupBy('label')
            ->selectRaw('coalesce(products.name, sale_items.designation) as label, sum(sale_items.line_total) as value, sum(sale_items.quantity) as quantity')
            ->orderByDesc('value')
            ->limit($limit)
            ->toBase()
            ->get()
            ->map(fn (object $row) => [
                'label' => (string) $row->label,
                'value' => (int) $row->value,
                'detail' => (int) $row->quantity.' vendu'.((int) $row->quantity > 1 ? 's' : ''),
            ])
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    protected function topCustomers(Carbon $from, Carbon $to, int $limit = 8): array
    {
        return Sale::valid()
            ->between($from, $to)
            ->join('customers', 'customers.id', '=', 'sales.customer_id')
            ->groupBy('customers.name')
            ->selectRaw('customers.name as label, sum(sales.total) as value, count(*) as orders')
            ->orderByDesc('value')
            ->limit($limit)
            ->toBase()
            ->get()
            ->map(fn (object $row) => [
                'label' => (string) $row->label,
                'value' => (int) $row->value,
                'detail' => (int) $row->orders.' achat'.((int) $row->orders > 1 ? 's' : ''),
            ])
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    protected function byCategory(Carbon $from, Carbon $to): array
    {
        return SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->leftJoin('product_variants', 'product_variants.id', '=', 'sale_items.product_variant_id')
            ->leftJoin('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->where('sales.status', 'validee')
            ->whereBetween('sales.sold_at', [$from, $to])
            ->groupBy('label')
            ->selectRaw("coalesce(categories.name, 'Sans catégorie') as label, sum(sale_items.line_total) as value, sum(sale_items.quantity) as quantity")
            ->orderByDesc('value')
            ->toBase()
            ->get()
            ->map(fn (object $row) => [
                'label' => (string) $row->label,
                'value' => (int) $row->value,
                'detail' => (int) $row->quantity.' article'.((int) $row->quantity > 1 ? 's' : ''),
            ])
            ->all();
    }

    /*
    |--------------------------------------------------------------------------
    | Affluence
    |--------------------------------------------------------------------------
    */

    /**
     * Nombre de ventes par jour de semaine et par heure : de quoi savoir
     * quand la boutique se remplit, donc quand renforcer l'équipe.
     *
     * @return array<string, mixed>
     */
    protected function heatmap(Carbon $from, Carbon $to): array
    {
        $rows = Sale::valid()
            ->between($from, $to)
            ->selectRaw("strftime('%w', sold_at) as weekday, strftime('%H', sold_at) as hour, count(*) as total")
            ->groupBy('weekday', 'hour')
            ->toBase()
            ->get();

        // strftime rend 0 = dimanche ; on réordonne sur une semaine française.
        $order = [1, 2, 3, 4, 5, 6, 0];
        $names = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

        $counts = [];
        $max = 0;
        $minHour = 23;
        $maxHour = 0;

        foreach ($rows as $row) {
            $weekday = (int) $row->weekday;
            $hour = (int) $row->hour;
            $total = (int) $row->total;

            $counts[$weekday][$hour] = $total;
            $max = max($max, $total);
            $minHour = min($minHour, $hour);
            $maxHour = max($maxHour, $hour);
        }

        // Plage horaire par défaut d'une boutique, élargie si les ventes
        // débordent : afficher 24 colonnes vides n'aide personne.
        $start = $max > 0 ? min($minHour, 8) : 8;
        $end = $max > 0 ? max($maxHour, 20) : 20;

        $grid = [];

        foreach ($order as $index => $weekday) {
            $cells = [];

            for ($hour = $start; $hour <= $end; $hour++) {
                $cells[] = [
                    'hour' => $hour,
                    'count' => $counts[$weekday][$hour] ?? 0,
                ];
            }

            $grid[] = ['day' => $names[$index], 'cells' => $cells];
        }

        return [
            'rows' => $grid,
            'hours' => range($start, $end),
            'max' => $max,
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Stock
    |--------------------------------------------------------------------------
    */

    /** @return array<int, array<string, mixed>> */
    protected function lowStock(int $limit = 8): array
    {
        return ProductVariant::with('product:id,name')
            ->active()
            ->lowStock()
            ->orderBy('stock_quantity')
            ->limit($limit)
            ->get()
            ->map(fn (ProductVariant $variant) => [
                'id' => $variant->id,
                'productId' => $variant->product_id,
                'label' => $variant->fullLabel(),
                'sku' => $variant->sku,
                'stock' => $variant->stock_quantity,
                'threshold' => max(1, $variant->low_stock_threshold),
            ])
            ->all();
    }

    /*
    |--------------------------------------------------------------------------
    | Assistants
    |--------------------------------------------------------------------------
    */

    protected function revenue(Carbon $from, Carbon $to): int
    {
        return (int) Sale::valid()->between($from, $to)->sum('total');
    }

    /** Null quand la période précédente est vide : « +100 % » ne voudrait rien dire. */
    protected function delta(int $current, int $previous): ?float
    {
        if ($previous <= 0) {
            return null;
        }

        return round((($current - $previous) / $previous) * 100, 1);
    }

    protected function periodLabel(Carbon $from, Carbon $to): string
    {
        return 'Du '.$from->translatedFormat('j M').' au '.$to->translatedFormat('j M Y');
    }

    protected function previousLabel(string $preset): string
    {
        return match ($preset) {
            '7j' => '7 jours précédents',
            '90j' => '90 jours précédents',
            '12m' => '12 mois précédents',
            default => '30 jours précédents',
        };
    }
}
