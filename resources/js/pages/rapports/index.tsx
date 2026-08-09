import { Head, router } from '@inertiajs/react';
import {
    Coins,
    Download,
    PackageSearch,
    Receipt,
    TrendingUp,
    Warehouse,
} from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { amount, count, money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';

type Kpis = {
    revenue: number;
    margin: number;
    marginRate: number;
    salesCount: number;
    itemsSold: number;
    averageBasket: number;
    discountsGiven: number;
    stockValue: number;
    stockRetailValue: number;
};

type DailyPoint = {
    date: string;
    label: string;
    revenue: number;
    margin: number;
    orders: number;
};

type Row = {
    name: string;
    quantity?: number;
    revenue: number;
    orders?: number;
    margin?: number;
};

type TopProduct = {
    designation: string;
    sku: string | null;
    quantity: number;
    revenue: number;
    margin: number;
};

type DormantRow = {
    id: number;
    label: string;
    sku: string;
    stock: number;
    stockValue: number;
    sellingPrice: number;
};

const PRESETS = [
    { value: 'jour', label: "Aujourd'hui" },
    { value: 'semaine', label: 'Cette semaine' },
    { value: 'mois', label: 'Ce mois' },
    { value: 'annee', label: 'Cette année' },
    { value: 'tout', label: 'Tout' },
];

export default function Rapports({
    period,
    kpis,
    daily,
    byCategory,
    byPayment,
    bySeller,
    topProducts,
    dormant,
}: {
    period: { from: string; to: string; preset: string };
    kpis: Kpis;
    daily: DailyPoint[];
    byCategory: Row[];
    byPayment: Array<Row & { method: string; label: string }>;
    bySeller: Row[];
    topProducts: TopProduct[];
    dormant: DormantRow[];
}) {
    const maxRevenue = Math.max(...daily.map((d) => d.revenue), 1);
    const query = `periode=${period.preset}&du=${period.from}&au=${period.to}`;

    function setPreset(preset: string) {
        router.get(
            '/rapports',
            { periode: preset },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    function setRange(field: 'du' | 'au', value: string) {
        router.get(
            '/rapports',
            {
                du: field === 'du' ? value : period.from,
                au: field === 'au' ? value : period.to,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    return (
        <>
            <Head title="Rapports" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Rapports"
                    description="Analyse de l'activité sur la période choisie."
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <a
                                    href={`/rapports/export?type=ventes&${query}`}
                                >
                                    <Download className="size-4" />
                                    Ventes (CSV)
                                </a>
                            </Button>
                            <Button asChild variant="outline">
                                <a
                                    href={`/rapports/export?type=produits&${query}`}
                                >
                                    <Download className="size-4" />
                                    Produits (CSV)
                                </a>
                            </Button>
                            <Button asChild variant="outline">
                                <a
                                    href={`/rapports/export?type=stock&${query}`}
                                >
                                    <Download className="size-4" />
                                    Stock (CSV)
                                </a>
                            </Button>
                        </>
                    }
                />

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1 rounded-lg border p-1">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.value}
                                type="button"
                                onClick={() => setPreset(preset.value)}
                                className={cn(
                                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                                    period.preset === preset.value
                                        ? 'bg-primary font-medium text-primary-foreground'
                                        : 'hover:bg-accent',
                                )}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    <Input
                        type="date"
                        value={period.from}
                        onChange={(event) => setRange('du', event.target.value)}
                        className="h-9 w-40"
                        aria-label="Du"
                    />
                    <span className="text-sm text-muted-foreground">au</span>
                    <Input
                        type="date"
                        value={period.to}
                        onChange={(event) => setRange('au', event.target.value)}
                        className="h-9 w-40"
                        aria-label="Au"
                    />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Chiffre d'affaires"
                        value={money(kpis.revenue)}
                        hint={`${count(kpis.salesCount)} vente${kpis.salesCount > 1 ? 's' : ''}`}
                        icon={Receipt}
                        tone="info"
                    />
                    <StatCard
                        label="Marge"
                        value={money(kpis.margin)}
                        hint={`Taux ${percent(kpis.marginRate)}`}
                        icon={Coins}
                        tone="success"
                    />
                    <StatCard
                        label="Panier moyen"
                        value={money(kpis.averageBasket)}
                        hint={`${count(kpis.itemsSold)} articles vendus`}
                        icon={TrendingUp}
                    />
                    <StatCard
                        label="Valeur du stock"
                        value={money(kpis.stockValue)}
                        hint={`${money(kpis.stockRetailValue)} au prix de vente`}
                        icon={Warehouse}
                    />
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Évolution jour par jour</CardTitle>
                        <CardDescription>
                            Chiffre d'affaires (barres) et marge (surlignage).
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {daily.length === 0 ? (
                            <EmptyState
                                icon={Receipt}
                                title="Aucune vente sur la période"
                                className="py-8"
                            />
                        ) : (
                            <div className="flex h-56 items-end gap-1 overflow-x-auto">
                                {daily.map((point) => (
                                    <div
                                        key={point.date}
                                        className="group flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1.5"
                                        title={`${point.label} — ${money(point.revenue)} · marge ${money(point.margin)}`}
                                    >
                                        <span className="text-[10px] text-muted-foreground tabular-nums opacity-0 group-hover:opacity-100">
                                            {amount(point.revenue)}
                                        </span>
                                        <div
                                            className="flex w-full flex-col justify-end rounded-t bg-blue-500/70 transition-colors group-hover:bg-blue-500"
                                            style={{
                                                height: `${Math.max((point.revenue / maxRevenue) * 100, 3)}%`,
                                            }}
                                        >
                                            <div
                                                className="w-full rounded-t bg-emerald-500/80"
                                                style={{
                                                    height: `${point.revenue > 0 ? Math.max((point.margin / point.revenue) * 100, 0) : 0}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="text-[10px] whitespace-nowrap text-muted-foreground">
                                            {point.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-3">
                    <SimpleTable
                        title="Par catégorie"
                        rows={byCategory.map((row) => ({
                            name: row.name,
                            detail: `${count(row.quantity ?? 0)} article${(row.quantity ?? 0) > 1 ? 's' : ''}`,
                            value: money(row.revenue),
                        }))}
                    />
                    <SimpleTable
                        title="Par mode de paiement"
                        rows={byPayment.map((row) => ({
                            name: row.label,
                            detail: `${count(row.orders ?? 0)} vente${(row.orders ?? 0) > 1 ? 's' : ''}`,
                            value: money(row.revenue),
                        }))}
                    />
                    <SimpleTable
                        title="Par vendeur"
                        rows={bySeller.map((row) => ({
                            name: row.name,
                            detail: `${count(row.orders ?? 0)} vente${(row.orders ?? 0) > 1 ? 's' : ''} · marge ${money(row.margin ?? 0)}`,
                            value: money(row.revenue),
                        }))}
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Meilleures ventes</CardTitle>
                            <CardDescription>
                                Classement par quantité vendue sur la période.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0">
                            {topProducts.length === 0 ? (
                                <EmptyState
                                    icon={TrendingUp}
                                    title="Aucune vente"
                                    className="py-8"
                                />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Article</TableHead>
                                            <TableHead className="text-right">
                                                Qté
                                            </TableHead>
                                            <TableHead className="text-right">
                                                CA
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Marge
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {topProducts.map((product) => (
                                            <TableRow key={product.designation}>
                                                <TableCell>
                                                    <span className="text-sm font-medium">
                                                        {product.designation}
                                                    </span>
                                                    {product.sku ? (
                                                        <span className="block font-mono text-xs text-muted-foreground">
                                                            {product.sku}
                                                        </span>
                                                    ) : null}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {product.quantity}
                                                </TableCell>
                                                <TableCell className="text-right text-sm tabular-nums">
                                                    {money(product.revenue)}
                                                </TableCell>
                                                <TableCell className="text-right text-sm text-emerald-600 tabular-nums dark:text-emerald-400">
                                                    {money(product.margin)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Stock dormant</CardTitle>
                            <CardDescription>
                                En stock mais aucune vente depuis 60 jours —
                                c'est de l'argent immobilisé.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-0">
                            {dormant.length === 0 ? (
                                <EmptyState
                                    icon={PackageSearch}
                                    title="Rien de dormant"
                                    description="Tous les articles en stock ont été vendus récemment."
                                    className="py-8"
                                />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Article</TableHead>
                                            <TableHead className="text-right">
                                                Stock
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Valeur immobilisée
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dormant.map((row) => (
                                            <TableRow key={row.id}>
                                                <TableCell>
                                                    <span className="text-sm font-medium">
                                                        {row.label}
                                                    </span>
                                                    <span className="block font-mono text-xs text-muted-foreground">
                                                        {row.sku}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {row.stock}
                                                </TableCell>
                                                <TableCell className="text-right text-sm tabular-nums">
                                                    {money(row.stockValue)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

function SimpleTable({
    title,
    rows,
}: {
    title: string;
    rows: Array<{ name: string; detail: string; value: string }>;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="px-3">
                {rows.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                        Aucune donnée sur la période.
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {rows.map((row) => (
                            <li
                                key={row.name}
                                className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">
                                        {row.name}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {row.detail}
                                    </span>
                                </span>
                                <span className="shrink-0 text-sm font-semibold tabular-nums">
                                    {row.value}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}

Rapports.layout = {
    breadcrumbs: [{ title: 'Rapports', href: '/rapports' }],
};
