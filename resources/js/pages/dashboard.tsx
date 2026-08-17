import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    Banknote,
    BarChart3,
    FileText,
    PackageCheck,
    PackagePlus,
    PackageX,
    QrCode,
    RefreshCw,
    RotateCcw,
    ShoppingCart,
    Truck,
    Users,
    Wallet,
    Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AgeingChart } from '@/components/charts/ageing-chart';
import type { AgeingBucket } from '@/components/charts/ageing-chart';
import { BarList } from '@/components/charts/bar-list';
import type { BarRow } from '@/components/charts/bar-list';
import {
    ChartCard,
    ChartEmpty,
    LegendItem,
} from '@/components/charts/chart-card';
import { Heatmap } from '@/components/charts/heatmap';
import type { HeatmapRow } from '@/components/charts/heatmap';
import { StatusBar } from '@/components/charts/status-bar';
import type { StatusSlice } from '@/components/charts/status-bar';
import { TrendChart } from '@/components/charts/trend-chart';
import type { TrendPoint } from '@/components/charts/trend-chart';
import { Delta } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCountUp } from '@/hooks/use-count-up';
import { amount, count, money, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

type Kpi = {
    key: string;
    label: string;
    value: string;
    hint: string;
    tone: 'default' | 'success' | 'warning' | 'danger';
};

type Period = {
    preset: string;
    label: string;
    previousLabel: string;
    options: Array<{ value: string; label: string }>;
};

type QuickAction = {
    key: string;
    label: string;
    hint: string;
    href: string;
    icon: string;
    primary?: boolean;
};

/*
 * Le serveur envoie un nom d'icône, pas un composant : la bibliothèque vit
 * ici. Un nom inconnu retombe sur une icône neutre plutôt que de casser la
 * page entière.
 */
const ACTION_ICONS: Record<string, LucideIcon> = {
    'shopping-cart': ShoppingCart,
    wallet: Wallet,
    banknote: Banknote,
    'rotate-ccw': RotateCcw,
    users: Users,
    'file-text': FileText,
    warehouse: Warehouse,
    'package-plus': PackagePlus,
    truck: Truck,
    'package-check': PackageCheck,
    'bar-chart': BarChart3,
    'qr-code': QrCode,
};

type LowStockRow = {
    id: number;
    productId: number;
    label: string;
    sku: string;
    stock: number;
    threshold: number;
};

export default function Dashboard({
    isGerant,
    quickActions,
    period,
    hero,
    kpis,
    daily,
    ageing,
    collection,
    topProducts,
    topCustomers,
    byCategory,
    heatmap,
    lowStock,
}: {
    isGerant: boolean;
    quickActions: QuickAction[];
    period: Period;
    hero: { revenue: number; delta: number | null; salesCount: number };
    kpis: Kpi[];
    daily: { points: TrendPoint[]; showMargin: boolean };
    ageing: { buckets: AgeingBucket[]; total: number };
    collection: StatusSlice[];
    topProducts: BarRow[];
    topCustomers: BarRow[];
    byCategory: BarRow[];
    heatmap: { rows: HeatmapRow[]; hours: number[]; max: number };
    lowStock: LowStockRow[];
}) {
    const revenue = useCountUp(hero.revenue);

    function changePeriod(value: string) {
        if (!value || value === period.preset) {
            return;
        }

        router.get(
            '/dashboard',
            { periode: value },
            { preserveScroll: true, preserveState: true },
        );
    }

    return (
        <>
            <Head title="Accueil" />

            <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
                {/* Barre de période : un seul rang de contrôles, au-dessus de tout */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={period.preset}
                        onValueChange={changePeriod}
                        className="w-full sm:w-auto"
                    >
                        {period.options.map((option) => (
                            <ToggleGroupItem
                                key={option.value}
                                value={option.value}
                                className="h-9 flex-1 px-3 text-xs sm:h-8 sm:flex-none"
                            >
                                {option.label}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => router.reload()}
                        >
                            <RefreshCw className="size-4" />
                            Actualiser
                        </Button>

                        <Button asChild size="sm">
                            <Link href="/documents?vente=1">
                                <ShoppingCart className="size-4" />
                                Encaisser une vente
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* Le chiffre que la page porte */}
                <div className="anim-entree space-y-1">
                    <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                        Chiffre d'affaires
                    </p>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        {/*
                         * Le montant défile jusqu'à sa valeur. En changeant de
                         * période il part de l'ancien chiffre : on voit dans
                         * quel sens ça bouge avant même de lire l'écart.
                         * Chiffres à chasse fixe, sinon la ligne tremble
                         * pendant le décompte.
                         */}
                        <p className="text-3xl leading-none font-semibold tabular-nums sm:text-4xl lg:text-5xl">
                            {money(revenue)}
                        </p>
                        {hero.delta !== null ? (
                            <Delta
                                value={hero.delta}
                                label={`vs ${period.previousLabel}`}
                            />
                        ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {period.label} · {count(hero.salesCount)}{' '}
                        {plural(hero.salesCount, 'vente')}
                    </p>
                </div>

                <div
                    className={cn(
                        'grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3',
                        kpis.length === 6 ? 'xl:grid-cols-6' : 'xl:grid-cols-5',
                    )}
                >
                    {kpis.map((kpi, index) => (
                        <KpiTile key={kpi.key} kpi={kpi} delay={index * 50} />
                    ))}
                </div>

                <QuickActions actions={quickActions} />

                <ChartCard
                    title="Évolution des ventes"
                    delay={120}
                    description={
                        daily.showMargin
                            ? 'L’écart entre les deux courbes, c’est ce que coûtent les articles vendus.'
                            : 'Encaissements jour par jour sur la période.'
                    }
                    legend={
                        daily.showMargin ? (
                            <div className="flex items-center gap-3">
                                <LegendItem
                                    color="var(--viz-series-1)"
                                    label="Chiffre d'affaires"
                                />
                                <LegendItem
                                    color="var(--viz-series-2)"
                                    label="Marge"
                                />
                            </div>
                        ) : null
                    }
                    table={{
                        head: daily.showMargin
                            ? [
                                  'Période',
                                  'Ventes',
                                  'Chiffre d’affaires',
                                  'Marge',
                              ]
                            : ['Période', 'Ventes', 'Chiffre d’affaires'],
                        rows: daily.points.map((point) => ({
                            key: point.date,
                            cells: daily.showMargin
                                ? [
                                      <span className="capitalize">
                                          {point.fullLabel}
                                      </span>,
                                      count(point.orders),
                                      amount(point.revenue),
                                      amount(point.margin ?? 0),
                                  ]
                                : [
                                      <span className="capitalize">
                                          {point.fullLabel}
                                      </span>,
                                      count(point.orders),
                                      amount(point.revenue),
                                  ],
                        })),
                    }}
                >
                    <TrendChart
                        points={daily.points}
                        showMargin={daily.showMargin}
                    />
                </ChartCard>

                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    <ChartCard
                        title="Créances par ancienneté"
                        delay={200}
                        description={
                            ageing.total > 0
                                ? `${money(ageing.total)} en attente de règlement`
                                : 'Aucun impayé, toutes les factures sont réglées.'
                        }
                        table={{
                            head: ['Tranche', 'Factures', 'Montant dû'],
                            rows: ageing.buckets.map((bucket) => ({
                                key: bucket.key,
                                cells: [
                                    bucket.label,
                                    count(bucket.count),
                                    amount(bucket.amount),
                                ],
                            })),
                        }}
                    >
                        {ageing.total > 0 ? (
                            <AgeingChart buckets={ageing.buckets} />
                        ) : (
                            <ChartEmpty message="Aucune facture en attente de règlement." />
                        )}
                    </ChartCard>

                    <ChartCard
                        title="Statut d'encaissement"
                        delay={240}
                        description="Factures émises sur la période."
                        table={{
                            head: ['Statut', 'Factures', 'Montant'],
                            rows: collection.map((slice) => ({
                                key: slice.key,
                                cells: [
                                    slice.label,
                                    count(slice.count),
                                    amount(slice.amount),
                                ],
                            })),
                        }}
                    >
                        <StatusBar slices={collection} />
                    </ChartCard>

                    <ChartCard
                        title="Meilleurs produits"
                        delay={280}
                        description="Chiffre d'affaires par modèle."
                        table={{
                            head: ['Produit', 'Vendus', 'Chiffre d’affaires'],
                            rows: topProducts.map((row) => ({
                                key: row.label,
                                cells: [
                                    row.label,
                                    row.detail ?? '',
                                    amount(row.value),
                                ],
                            })),
                        }}
                    >
                        {topProducts.length > 0 ? (
                            <BarList rows={topProducts} />
                        ) : (
                            <ChartEmpty message="Aucune vente sur la période." />
                        )}
                    </ChartCard>

                    <ChartCard
                        title="Meilleurs clients"
                        delay={320}
                        description="Hors ventes au comptoir sans client."
                        table={{
                            head: ['Client', 'Achats', 'Total'],
                            rows: topCustomers.map((row) => ({
                                key: row.label,
                                cells: [
                                    row.label,
                                    row.detail ?? '',
                                    amount(row.value),
                                ],
                            })),
                        }}
                    >
                        {topCustomers.length > 0 ? (
                            <BarList rows={topCustomers} />
                        ) : (
                            <ChartEmpty message="Aucune vente nominative sur la période." />
                        )}
                    </ChartCard>

                    <ChartCard
                        title="Ventes par catégorie"
                        delay={360}
                        description="Où se fait le chiffre d'affaires."
                        table={{
                            head: [
                                'Catégorie',
                                'Articles',
                                'Chiffre d’affaires',
                            ],
                            rows: byCategory.map((row) => ({
                                key: row.label,
                                cells: [
                                    row.label,
                                    row.detail ?? '',
                                    amount(row.value),
                                ],
                            })),
                        }}
                    >
                        {byCategory.length > 0 ? (
                            <BarList rows={byCategory} />
                        ) : (
                            <ChartEmpty message="Aucune vente sur la période." />
                        )}
                    </ChartCard>

                    <ChartCard
                        title="Affluence"
                        delay={400}
                        description="Nombre de ventes par jour et par heure."
                        table={{
                            head: ['Jour', 'Ventes', 'Heure la plus chargée'],
                            rows: heatmap.rows.map((row) => {
                                const total = row.cells.reduce(
                                    (sum, cell) => sum + cell.count,
                                    0,
                                );
                                const busiest = row.cells.reduce(
                                    (best, cell) =>
                                        cell.count > best.count ? cell : best,
                                    row.cells[0],
                                );

                                return {
                                    key: row.day,
                                    cells: [
                                        row.day,
                                        count(total),
                                        total > 0
                                            ? `${busiest.hour} h — ${count(busiest.count)}`
                                            : '—',
                                    ],
                                };
                            }),
                        }}
                    >
                        <Heatmap
                            rows={heatmap.rows}
                            hours={heatmap.hours}
                            max={heatmap.max}
                        />
                    </ChartCard>
                </div>

                <ChartCard
                    title="À réapprovisionner"
                    delay={440}
                    description="Les articles passés sous leur seuil d'alerte."
                    action={
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/stock" className="text-xs">
                                Voir le stock
                            </Link>
                        </Button>
                    }
                >
                    {lowStock.length === 0 ? (
                        <ChartEmpty message="Tous les articles sont au-dessus de leur seuil." />
                    ) : (
                        <ul className="grid grid-cols-1 gap-x-6 gap-y-3 pb-3 sm:grid-cols-2 xl:grid-cols-4">
                            {lowStock.map((row) => (
                                <li key={row.id}>
                                    <Link
                                        href={`/produits/${row.productId}`}
                                        className="block rounded-md py-1 transition-opacity duration-150 hover:opacity-70"
                                    >
                                        <span className="flex items-baseline justify-between gap-3">
                                            <span className="truncate text-xs">
                                                {row.label}
                                            </span>
                                            <StockCue
                                                stock={row.stock}
                                                threshold={row.threshold}
                                            />
                                        </span>
                                        <Meter
                                            stock={row.stock}
                                            threshold={row.threshold}
                                        />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </ChartCard>

                {isGerant ? (
                    <p className="text-center text-xs text-muted-foreground">
                        Les rapports détaillés (marges, valorisation, arrivages)
                        sont dans{' '}
                        <Link href="/rapports" className="underline">
                            Rapports
                        </Link>
                        .
                    </p>
                ) : null}
            </div>
        </>
    );
}

const HINT_TONE: Record<Kpi['tone'], string> = {
    default: 'text-muted-foreground',
    success: 'text-muted-foreground',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
};

/** Tuile de chiffre clé : libellé discret, valeur en gras, une précision dessous. */
/**
 * Accès rapides.
 *
 * Placés sous les chiffres et non au-dessus : on ouvre l'accueil pour savoir
 * où on en est, puis on agit. L'inverse ferait de la page un menu.
 */
function QuickActions({ actions }: { actions: QuickAction[] }) {
    if (actions.length === 0) {
        return null;
    }

    return (
        <div className="anim-entree">
            <p className="mb-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Accès rapides
            </p>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                {actions.map((action) => {
                    const Icon = ACTION_ICONS[action.icon] ?? ShoppingCart;

                    return (
                        <Link
                            key={action.key}
                            href={action.href}
                            className={cn(
                                'group flex items-center gap-3 rounded-xl border p-3 shadow-sm transition-colors',
                                action.primary
                                    ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
                                    : 'bg-card hover:bg-accent',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                                    action.primary
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground',
                                )}
                            >
                                <Icon className="size-4" />
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">
                                    {action.label}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {action.hint}
                                </span>
                            </span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

function KpiTile({ kpi, delay }: { kpi: Kpi; delay: number }) {
    return (
        <div
            style={{ animationDelay: `${delay}ms` }}
            className="anim-entree rounded-xl border bg-card p-3 shadow-sm transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md"
        >
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="mt-1 truncate text-lg font-semibold">{kpi.value}</p>
            <p className={cn('mt-0.5 truncate text-xs', HINT_TONE[kpi.tone])}>
                {kpi.hint}
            </p>
        </div>
    );
}

/**
 * Jauge stock / seuil.
 * La piste est un ton clair de la même rampe que la barre : l'état se lit sur
 * toute la largeur, même quand il reste très peu.
 */
function Meter({ stock, threshold }: { stock: number; threshold: number }) {
    const ratio = Math.min(Math.max(stock / threshold, 0), 1);
    const empty = stock <= 0;

    return (
        <span
            className={cn(
                'mt-1.5 block h-1.5 w-full overflow-hidden rounded-full',
                empty ? 'bg-red-500/15' : 'bg-amber-500/15',
            )}
        >
            <span
                className={cn(
                    'anim-barre-h block h-full rounded-full transition-[width] duration-300 ease-out',
                    empty ? 'bg-red-500' : 'bg-amber-500',
                )}
                style={{ width: `${Math.max(ratio * 100, empty ? 0 : 6)}%` }}
            />
        </span>
    );
}

/** L'icône et le texte doublent la couleur : l'état ne repose jamais sur elle seule. */
function StockCue({ stock, threshold }: { stock: number; threshold: number }) {
    const empty = stock <= 0;
    const Icon = empty ? PackageX : AlertTriangle;

    return (
        <span
            className={cn(
                'flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums',
                empty
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-amber-600 dark:text-amber-400',
            )}
        >
            <Icon className="size-3.5" />
            {empty ? 'Rupture' : `${stock} / ${threshold}`}
        </span>
    );
}

Dashboard.layout = {
    breadcrumbs: [{ title: 'Accueil', href: '/dashboard' }],
};
