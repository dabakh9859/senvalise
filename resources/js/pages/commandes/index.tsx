import { Head, Link } from '@inertiajs/react';
import { PackageCheck, PiggyBank, Truck, Wallet } from 'lucide-react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Input } from '@/components/ui/input';
import { useFilters } from '@/hooks/use-filters';
import { count, dateTime, money } from '@/lib/format';
import type { IdOption, Option, Paginated } from '@/types';
import type { StatusTone } from '@/types/senvalise';

type OrderRow = {
    id: number;
    reference: string;
    status: string;
    statusLabel: string;
    statusTone: StatusTone;
    step: number;
    customerName: string;
    customerPhone: string;
    customerLabel: string | null;
    zone: string | null;
    total: number;
    itemCount: number;
    placedAt: string | null;
    isPaid: boolean;
    fromVault: boolean;
};

export default function CommandesIndex({
    orders,
    filters,
    statuses,
    zones,
    totals,
}: {
    orders: Paginated<OrderRow>;
    filters: Record<string, string | undefined>;
    statuses: Option[];
    zones: IdOption[];
    totals: {
        pending: number;
        inProgress: number;
        delivered: number;
        revenue: number;
    };
}) {
    const { values, set, reset, isFiltered } = useFilters('/commandes', {
        recherche: filters.recherche ?? '',
        statut: filters.statut ?? '',
        zone: filters.zone ?? '',
        du: filters.du ?? '',
        au: filters.au ?? '',
    });

    return (
        <>
            <Head title="Commandes en ligne" />

            <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
                <PageHeader
                    title="Commandes en ligne"
                    description="Les commandes passées sur la boutique. Confirmer sort le stock et crée la vente."
                />

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard
                        label="À confirmer"
                        value={count(totals.pending)}
                        icon={PackageCheck}
                        tone={totals.pending > 0 ? 'warning' : 'default'}
                    />
                    <StatCard
                        label="En cours"
                        value={count(totals.inProgress)}
                        icon={Truck}
                        tone="info"
                    />
                    <StatCard
                        label="Livrées"
                        value={count(totals.delivered)}
                        icon={PackageCheck}
                        tone="success"
                    />
                    <StatCard
                        label="Montant"
                        value={money(totals.revenue)}
                        hint="Hors annulées"
                        icon={Wallet}
                    />
                </div>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Numéro, nom, téléphone…"
                    onReset={reset}
                    isFiltered={isFiltered}
                >
                    <FilterSelect
                        value={values.statut}
                        onChange={(value) => set('statut', value, true)}
                        options={statuses}
                        allLabel="Tous statuts"
                        width="sm:w-40"
                    />
                    <FilterSelect
                        value={values.zone}
                        onChange={(value) => set('zone', value, true)}
                        options={zones.map((zone) => ({
                            value: zone.id,
                            label: zone.name,
                        }))}
                        allLabel="Toutes zones"
                        width="sm:w-40"
                    />
                    <Input
                        type="date"
                        value={values.du}
                        onChange={(event) => set('du', event.target.value, true)}
                        className="h-10 w-full sm:h-8 sm:w-38"
                        aria-label="Du"
                    />
                    <Input
                        type="date"
                        value={values.au}
                        onChange={(event) => set('au', event.target.value, true)}
                        className="h-10 w-full sm:h-8 sm:w-38"
                        aria-label="Au"
                    />
                </FilterBar>

                <DataList
                    rows={orders.data}
                    getKey={(order) => order.id}
                    tileHref={(order) => `/commandes/${order.id}`}
                    columns={[
                        {
                            key: 'reference',
                            header: 'Commande',
                            cell: (order) => (
                                <>
                                    <Link
                                        href={`/commandes/${order.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {order.reference}
                                    </Link>
                                    <span className="block text-xs text-muted-foreground">
                                        {dateTime(order.placedAt)}
                                    </span>
                                </>
                            ),
                        },
                        {
                            key: 'client',
                            header: 'Client',
                            className: 'text-sm',
                            cell: (order) => (
                                <>
                                    {order.customerName}
                                    <span className="block text-xs text-muted-foreground">
                                        {order.customerPhone}
                                        {order.customerLabel ? ' · compte' : ''}
                                    </span>
                                </>
                            ),
                        },
                        {
                            key: 'zone',
                            header: 'Livraison',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (order) => order.zone ?? '—',
                        },
                        {
                            key: 'articles',
                            header: 'Articles',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm',
                            cell: (order) => order.itemCount,
                        },
                        {
                            key: 'total',
                            header: 'Total',
                            align: 'right',
                            className: 'font-medium',
                            cell: (order) => (
                                <>
                                    {money(order.total)}
                                    {order.fromVault ? (
                                        <span className="block text-xs text-blue-600 dark:text-blue-400">
                                            payé par coffre
                                        </span>
                                    ) : order.isPaid ? (
                                        <span className="block text-xs text-emerald-600 dark:text-emerald-400">
                                            réglé
                                        </span>
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'statut',
                            header: 'Statut',
                            cell: (order) => (
                                <StatusBadge
                                    label={order.statusLabel}
                                    tone={order.statusTone}
                                />
                            ),
                        },
                    ]}
                    tile={(order) => (
                        <div className="space-y-2">
                            <TileHeader
                                title={order.reference}
                                subtitle={`${order.customerName} · ${order.customerPhone}`}
                                trailing={
                                    <>
                                        <span className="block text-sm font-semibold tabular-nums">
                                            {money(order.total)}
                                        </span>
                                        <span className="block text-xs text-muted-foreground tabular-nums">
                                            {count(order.itemCount)} article
                                            {order.itemCount > 1 ? 's' : ''}
                                        </span>
                                    </>
                                }
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex items-center gap-2">
                                    <StatusBadge
                                        label={order.statusLabel}
                                        tone={order.statusTone}
                                    />
                                    {order.fromVault ? (
                                        <PiggyBank className="size-3.5 text-blue-600 dark:text-blue-400" />
                                    ) : null}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {order.zone ?? '—'} ·{' '}
                                    {dateTime(order.placedAt)}
                                </span>
                            </div>
                        </div>
                    )}
                    empty={
                        <EmptyState
                            icon={PackageCheck}
                            title="Aucune commande"
                            description={
                                isFiltered
                                    ? 'Aucune commande ne correspond à ces filtres.'
                                    : 'Les commandes passées sur la boutique en ligne apparaîtront ici.'
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={orders.links}
                            from={orders.from}
                            to={orders.to}
                            total={orders.total}
                            label="commandes"
                        />
                    }
                />
            </div>
        </>
    );
}

CommandesIndex.layout = {
    breadcrumbs: [{ title: 'Commandes', href: '/commandes' }],
};
