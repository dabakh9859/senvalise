<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function __construct(private readonly StockService $stock) {}

    public function index(Request $request): Response
    {
        [$from, $to] = $this->period($request);

        return Inertia::render('rapports/index', [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'preset' => $request->string('periode')->toString() ?: 'mois',
            ],
            'kpis' => $this->kpis($from, $to),
            'daily' => $this->daily($from, $to),
            'byCategory' => $this->byCategory($from, $to),
            'byPayment' => $this->byPayment($from, $to),
            'bySeller' => $this->bySeller($from, $to),
            'topProducts' => $this->topProducts($from, $to),
            'dormant' => $this->dormantStock(),
        ]);
    }

    /** Export CSV, ouvrable directement dans Excel. */
    public function export(Request $request): StreamedResponse
    {
        [$from, $to] = $this->period($request);
        $type = $request->string('type')->toString() ?: 'ventes';

        $filename = "senvalise-{$type}-{$from->format('Ymd')}-{$to->format('Ymd')}.csv";

        return response()->streamDownload(function () use ($type, $from, $to) {
            $out = fopen('php://output', 'wb');

            if ($out === false) {
                return;
            }

            // BOM UTF-8 : sans lui, Excel affiche « Ã© » à la place des accents.
            fwrite($out, "\xEF\xBB\xBF");

            match ($type) {
                'stock' => $this->streamStock($out),
                'produits' => $this->streamProducts($out, $from, $to),
                default => $this->streamSales($out, $from, $to),
            };

            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /** @return array{0: Carbon, 1: Carbon} */
    protected function period(Request $request): array
    {
        $preset = $request->string('periode')->toString();

        if ($request->filled('du') && $request->filled('au')) {
            return [
                Carbon::parse($request->date('du'))->startOfDay(),
                Carbon::parse($request->date('au'))->endOfDay(),
            ];
        }

        return match ($preset) {
            'jour' => [Carbon::today(), Carbon::today()->endOfDay()],
            'semaine' => [Carbon::today()->startOfWeek(), Carbon::today()->endOfDay()],
            'annee' => [Carbon::today()->startOfYear(), Carbon::today()->endOfDay()],
            'tout' => [Carbon::createFromTimestamp(0), Carbon::today()->endOfDay()],
            default => [Carbon::today()->startOfMonth(), Carbon::today()->endOfDay()],
        };
    }

    /** @return array<string, mixed> */
    protected function kpis(Carbon $from, Carbon $to): array
    {
        $sales = Sale::valid()->between($from, $to)->get(['total', 'total_cost', 'discount']);
        $revenue = (int) $sales->sum('total');
        $cost = (int) $sales->sum('total_cost');
        $count = $sales->count();

        $items = (int) SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', 'validee')
            ->whereBetween('sales.sold_at', [$from, $to])
            ->sum('sale_items.quantity');

        return [
            'revenue' => $revenue,
            'margin' => $revenue - $cost,
            'marginRate' => $revenue > 0 ? round((($revenue - $cost) / $revenue) * 100, 1) : 0.0,
            'salesCount' => $count,
            'itemsSold' => $items,
            'averageBasket' => $count > 0 ? (int) round($revenue / $count) : 0,
            'discountsGiven' => (int) $sales->sum('discount'),
            'stockValue' => $this->stock->totalStockValue(),
            'stockRetailValue' => $this->stock->totalRetailValue(),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    protected function daily(Carbon $from, Carbon $to): array
    {
        return Sale::valid()
            ->between($from, $to)
            ->selectRaw('date(sold_at) as day, sum(total) as revenue, sum(total - total_cost) as margin, count(*) as orders')
            ->groupBy('day')
            ->orderBy('day')
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'date' => $row->day,
                'label' => Carbon::parse((string) $row->day)->translatedFormat('d/m'),
                'revenue' => (int) $row->revenue,
                'margin' => (int) $row->margin,
                'orders' => (int) $row->orders,
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
            ->groupBy('categories.name')
            ->selectRaw("coalesce(categories.name, 'Sans catégorie') as name, sum(sale_items.quantity) as quantity, sum(sale_items.line_total) as revenue")
            ->orderByDesc('revenue')
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'name' => $row->name,
                'quantity' => (int) $row->quantity,
                'revenue' => (int) $row->revenue,
            ])
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    protected function byPayment(Carbon $from, Carbon $to): array
    {
        return Sale::valid()
            ->between($from, $to)
            ->groupBy('payment_method')
            ->selectRaw('payment_method, count(*) as orders, sum(total) as revenue')
            ->orderByDesc('revenue')
            ->toBase()
            ->get()
            ->map(function (object $row): array {
                $method = PaymentMethod::from((string) $row->payment_method);

                return [
                    'method' => $method->value,
                    'label' => $method->label(),
                    'orders' => (int) $row->orders,
                    'revenue' => (int) $row->revenue,
                ];
            })
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    protected function bySeller(Carbon $from, Carbon $to): array
    {
        return Sale::valid()
            ->between($from, $to)
            ->leftJoin('users', 'users.id', '=', 'sales.user_id')
            ->groupBy('users.name')
            ->selectRaw("coalesce(users.name, 'Non attribué') as name, count(*) as orders, sum(sales.total) as revenue, sum(sales.total - sales.total_cost) as margin")
            ->orderByDesc('revenue')
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'name' => $row->name,
                'orders' => (int) $row->orders,
                'revenue' => (int) $row->revenue,
                'margin' => (int) $row->margin,
            ])
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    protected function topProducts(Carbon $from, Carbon $to, int $limit = 15): array
    {
        return SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', 'validee')
            ->whereBetween('sales.sold_at', [$from, $to])
            ->groupBy('sale_items.designation', 'sale_items.sku')
            ->selectRaw('sale_items.designation, sale_items.sku, sum(sale_items.quantity) as quantity, sum(sale_items.line_total) as revenue, sum(sale_items.line_total - (sale_items.unit_cost * sale_items.quantity)) as margin')
            ->orderByDesc('quantity')
            ->limit($limit)
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'designation' => $row->designation,
                'sku' => $row->sku,
                'quantity' => (int) $row->quantity,
                'revenue' => (int) $row->revenue,
                'margin' => (int) $row->margin,
            ])
            ->all();
    }

    /**
     * Articles en stock qui ne se vendent pas : capital immobilisé.
     * Critère : au moins 1 en stock et aucune vente depuis 60 jours.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function dormantStock(int $days = 60, int $limit = 20): array
    {
        $since = Carbon::today()->subDays($days);

        $soldRecently = SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', 'validee')
            ->where('sales.sold_at', '>=', $since)
            ->whereNotNull('sale_items.product_variant_id')
            ->distinct()
            ->pluck('sale_items.product_variant_id');

        return ProductVariant::query()
            ->with('product:id,name')
            ->active()
            ->where('stock_quantity', '>', 0)
            ->whereNotIn('id', $soldRecently)
            ->orderByDesc(DB::raw('stock_quantity * cost_price'))
            ->limit($limit)
            ->get()
            ->map(fn (ProductVariant $v) => [
                'id' => $v->id,
                'label' => $v->fullLabel(),
                'sku' => $v->sku,
                'stock' => $v->stock_quantity,
                'stockValue' => $v->stock_value,
                'sellingPrice' => $v->selling_price,
            ])
            ->all();
    }

    /** @param  resource  $out */
    protected function streamSales($out, Carbon $from, Carbon $to): void
    {
        fputcsv($out, ['Référence', 'Date', 'Client', 'Vendeur', 'Articles', 'Sous-total', 'Remise', 'Total', 'Prix de revient', 'Marge', 'Paiement', 'Statut'], ';');

        Sale::with(['customer:id,name', 'user:id,name'])
            ->between($from, $to)
            ->orderBy('sold_at')
            ->chunk(200, function ($sales) use ($out) {
                foreach ($sales as $sale) {
                    fputcsv($out, [
                        $sale->reference,
                        $sale->sold_at?->format('d/m/Y H:i'),
                        $sale->customer->name ?? '',
                        $sale->user->name ?? '',
                        (int) $sale->items()->sum('quantity'),
                        $sale->subtotal,
                        $sale->discount,
                        $sale->total,
                        $sale->total_cost,
                        $sale->total - $sale->total_cost,
                        $sale->payment_method->label(),
                        $sale->status->label(),
                    ], ';');
                }
            });
    }

    /** @param  resource  $out */
    protected function streamStock($out): void
    {
        fputcsv($out, ['SKU', 'Code-barres', 'Produit', 'Taille', 'Couleur', 'Stock', 'Seuil', 'Prix de revient', 'Prix de vente', 'Valeur stock', 'Marge unitaire'], ';');

        ProductVariant::with('product:id,name')
            ->orderBy('product_id')
            ->chunk(200, function ($variants) use ($out) {
                foreach ($variants as $variant) {
                    fputcsv($out, [
                        $variant->sku,
                        $variant->barcode,
                        $variant->product?->name,
                        $variant->size,
                        $variant->color,
                        $variant->stock_quantity,
                        $variant->low_stock_threshold,
                        $variant->cost_price,
                        $variant->selling_price,
                        $variant->stock_value,
                        $variant->margin_amount,
                    ], ';');
                }
            });
    }

    /** @param  resource  $out */
    protected function streamProducts($out, Carbon $from, Carbon $to): void
    {
        fputcsv($out, ['Désignation', 'SKU', 'Quantité vendue', 'Chiffre d’affaires', 'Marge'], ';');

        foreach ($this->topProducts($from, $to, 1000) as $row) {
            fputcsv($out, [$row['designation'], $row['sku'], $row['quantity'], $row['revenue'], $row['margin']], ';');
        }
    }
}
