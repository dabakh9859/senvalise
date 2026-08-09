import { Head, Link } from '@inertiajs/react';
import { Receipt, ShoppingCart } from 'lucide-react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFilters } from '@/hooks/use-filters';
import { count, dateTime, money } from '@/lib/format';
import type { IdOption, Option, Paginated } from '@/types';

type SaleRow = {
    id: number;
    reference: string;
    soldAt: string | null;
    customer: string | null;
    seller: string | null;
    total: number;
    itemCount: number;
    paymentLabel: string;
    channelLabel: string;
    status: string;
    statusLabel: string;
    profit?: number;
};

export default function VentesIndex({
    sales,
    filters,
    totals,
    sellers,
    statuses,
    paymentMethods,
}: {
    sales: Paginated<SaleRow>;
    filters: Record<string, string | undefined>;
    totals: { count: number; revenue: number; margin?: number };
    sellers: IdOption[];
    statuses: Option[];
    paymentMethods: Option[];
}) {
    const { values, set, reset, isFiltered } = useFilters('/ventes', {
        recherche: filters.recherche ?? '',
        statut: filters.statut ?? '',
        paiement: filters.paiement ?? '',
        vendeur: filters.vendeur ?? '',
        du: filters.du ?? '',
        au: filters.au ?? '',
    });

    return (
        <>
            <Head title="Ventes" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Ventes"
                    description="Historique des encaissements de la boutique."
                    actions={
                        <Button asChild>
                            <Link href="/caisse">
                                <ShoppingCart className="size-4" />
                                Ouvrir la caisse
                            </Link>
                        </Button>
                    }
                />

                <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                        label="Ventes (filtre en cours)"
                        value={count(totals.count)}
                        icon={Receipt}
                    />
                    <StatCard
                        label="Chiffre d'affaires"
                        value={money(totals.revenue)}
                        tone="info"
                    />
                    {totals.margin !== undefined ? (
                        <StatCard
                            label="Marge dégagée"
                            value={money(totals.margin)}
                            tone="success"
                        />
                    ) : null}
                </div>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Numéro de ticket, client…"
                    onReset={reset}
                    isFiltered={isFiltered}
                >
                    <FilterSelect
                        value={values.statut}
                        onChange={(value) => set('statut', value, true)}
                        options={statuses}
                        allLabel="Tous statuts"
                        width="sm:w-36"
                    />
                    <FilterSelect
                        value={values.paiement}
                        onChange={(value) => set('paiement', value, true)}
                        options={paymentMethods}
                        allLabel="Tous paiements"
                        width="sm:w-40"
                    />
                    <FilterSelect
                        value={values.vendeur}
                        onChange={(value) => set('vendeur', value, true)}
                        options={sellers.map((s) => ({
                            value: s.id,
                            label: s.name,
                        }))}
                        allLabel="Tous vendeurs"
                        width="sm:w-40"
                    />
                    <Input
                        type="date"
                        value={values.du}
                        onChange={(event) =>
                            set('du', event.target.value, true)
                        }
                        className="h-10 w-full sm:h-8 sm:w-38"
                        aria-label="Du"
                    />
                    <Input
                        type="date"
                        value={values.au}
                        onChange={(event) =>
                            set('au', event.target.value, true)
                        }
                        className="h-10 w-full sm:h-8 sm:w-38"
                        aria-label="Au"
                    />
                </FilterBar>

                <DataList
                    rows={sales.data}
                    getKey={(sale) => sale.id}
                    tileHref={(sale) => `/ventes/${sale.id}`}
                    columns={[
                        {
                            key: 'ticket',
                            header: 'Ticket',
                            cell: (sale) => (
                                <>
                                    <Link
                                        href={`/ventes/${sale.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {sale.reference}
                                    </Link>
                                    {sale.status !== 'validee' ? (
                                        <StatusBadge
                                            label={sale.statusLabel}
                                            tone="danger"
                                            className="ml-2"
                                        />
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'date',
                            header: 'Date',
                            className:
                                'text-sm whitespace-nowrap text-muted-foreground',
                            cell: (sale) => dateTime(sale.soldAt),
                        },
                        {
                            key: 'client',
                            header: 'Client',
                            className: 'text-sm',
                            cell: (sale) =>
                                sale.customer ?? (
                                    <span className="text-muted-foreground">
                                        Client de passage
                                    </span>
                                ),
                        },
                        {
                            key: 'vendeur',
                            header: 'Vendeur',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (sale) => sale.seller ?? '—',
                        },
                        {
                            key: 'articles',
                            header: 'Articles',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm',
                            cell: (sale) => sale.itemCount,
                        },
                        {
                            key: 'paiement',
                            header: 'Paiement',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (sale) => sale.paymentLabel,
                        },
                        {
                            key: 'total',
                            header: 'Total',
                            align: 'right',
                            className: 'font-medium',
                            cell: (sale) => money(sale.total),
                        },
                        ...(sales.data[0]?.profit !== undefined
                            ? [
                                  {
                                      key: 'marge',
                                      header: 'Marge',
                                      align: 'right' as const,
                                      className:
                                          'text-emerald-600 dark:text-emerald-400',
                                      cell: (sale: SaleRow) =>
                                          money(sale.profit ?? 0),
                                  },
                              ]
                            : []),
                    ]}
                    tile={(sale) => (
                        <div className="space-y-1.5">
                            <TileHeader
                                title={
                                    <span className="flex items-center gap-2">
                                        {sale.reference}
                                        {sale.status !== 'validee' ? (
                                            <StatusBadge
                                                label={sale.statusLabel}
                                                tone="danger"
                                            />
                                        ) : null}
                                    </span>
                                }
                                subtitle={`${dateTime(sale.soldAt)} · ${sale.customer ?? 'Client de passage'}`}
                                trailing={
                                    <span className="text-sm font-semibold tabular-nums">
                                        {money(sale.total)}
                                    </span>
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                {count(sale.itemCount)} article
                                {sale.itemCount > 1 ? 's' : ''} ·{' '}
                                {sale.paymentLabel}
                                {sale.seller ? ` · ${sale.seller}` : ''}
                                {sale.profit !== undefined
                                    ? ` · marge ${money(sale.profit)}`
                                    : ''}
                            </p>
                        </div>
                    )}
                    empty={
                        <EmptyState
                            icon={Receipt}
                            title="Aucune vente"
                            description={
                                isFiltered
                                    ? 'Aucune vente ne correspond à ces filtres.'
                                    : 'Les ventes encaissées à la caisse apparaîtront ici.'
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={sales.links}
                            from={sales.from}
                            to={sales.to}
                            total={sales.total}
                            label="ventes"
                        />
                    }
                />
            </div>
        </>
    );
}

VentesIndex.layout = {
    breadcrumbs: [{ title: 'Ventes', href: '/ventes' }],
};
