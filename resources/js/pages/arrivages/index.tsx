import { Head, Link } from '@inertiajs/react';
import { PackagePlus, Truck, Wallet } from 'lucide-react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useFilters } from '@/hooks/use-filters';
import { count, date, money } from '@/lib/format';
import type { IdOption, Option, Paginated } from '@/types';

type ArrivalRow = {
    id: number;
    reference: string;
    supplier: string | null;
    date: string | null;
    status: string;
    statusLabel: string;
    quantity: number;
    goodsCost: number;
    extraCosts: number;
    totalCost: number;
    currency: string;
};

export default function ArrivagesIndex({
    arrivals,
    filters,
    suppliers,
    statuses,
    totals,
}: {
    arrivals: Paginated<ArrivalRow>;
    filters: Record<string, string | undefined>;
    suppliers: IdOption[];
    statuses: Option[];
    totals: { received: number; draft: number; investedThisYear: number };
}) {
    const { values, set, reset, isFiltered } = useFilters('/arrivages', {
        recherche: filters.recherche ?? '',
        statut: filters.statut ?? '',
        fournisseur: filters.fournisseur ?? '',
    });

    return (
        <>
            <Head title="Arrivages" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Arrivages"
                    description="Réceptions fournisseur. Les frais de transport et de douane sont répartis sur les articles pour obtenir le vrai prix de revient."
                    actions={
                        <Button asChild>
                            <Link href="/arrivages/nouveau">
                                <PackagePlus className="size-4" />
                                Nouvel arrivage
                            </Link>
                        </Button>
                    }
                />

                <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                        label="Arrivages réceptionnés"
                        value={count(totals.received)}
                        icon={Truck}
                    />
                    <StatCard
                        label="Brouillons en attente"
                        value={count(totals.draft)}
                        tone={totals.draft > 0 ? 'warning' : 'default'}
                    />
                    <StatCard
                        label="Investi cette année"
                        value={money(totals.investedThisYear)}
                        icon={Wallet}
                    />
                </div>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Référence ou fournisseur…"
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
                        value={values.fournisseur}
                        onChange={(value) => set('fournisseur', value, true)}
                        options={suppliers.map((s) => ({
                            value: s.id,
                            label: s.name,
                        }))}
                        allLabel="Tous fournisseurs"
                        width="sm:w-48"
                    />
                </FilterBar>

                <DataList
                    rows={arrivals.data}
                    getKey={(arrival) => arrival.id}
                    tileHref={(arrival) => `/arrivages/${arrival.id}`}
                    columns={[
                        {
                            key: 'reference',
                            header: 'Référence',
                            cell: (arrival) => (
                                <>
                                    <Link
                                        href={`/arrivages/${arrival.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {arrival.reference}
                                    </Link>
                                    {arrival.currency !== 'XOF' ? (
                                        <span className="block text-xs text-muted-foreground">
                                            acheté en {arrival.currency}
                                        </span>
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'fournisseur',
                            header: 'Fournisseur',
                            className: 'text-sm',
                            cell: (arrival) => arrival.supplier ?? '—',
                        },
                        {
                            key: 'date',
                            header: 'Date',
                            className:
                                'text-sm whitespace-nowrap text-muted-foreground',
                            cell: (arrival) => date(arrival.date),
                        },
                        {
                            key: 'quantite',
                            header: 'Quantité',
                            align: 'right',
                            cell: (arrival) => count(arrival.quantity),
                        },
                        {
                            key: 'marchandise',
                            header: 'Marchandise',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (arrival) => money(arrival.goodsCost),
                        },
                        {
                            key: 'frais',
                            header: 'Frais',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (arrival) => money(arrival.extraCosts),
                        },
                        {
                            key: 'total',
                            header: 'Coût total',
                            align: 'right',
                            className: 'font-medium',
                            cell: (arrival) => money(arrival.totalCost),
                        },
                        {
                            key: 'statut',
                            header: 'Statut',
                            cell: (arrival) => (
                                <StatutArrivage arrival={arrival} />
                            ),
                        },
                    ]}
                    tile={(arrival) => (
                        <div className="space-y-2">
                            <TileHeader
                                title={arrival.reference}
                                subtitle={`${arrival.supplier ?? 'sans fournisseur'} · ${date(arrival.date)}`}
                                trailing={
                                    <>
                                        <span className="block text-sm font-semibold tabular-nums">
                                            {money(arrival.totalCost)}
                                        </span>
                                        <span className="block text-xs text-muted-foreground tabular-nums">
                                            {count(arrival.quantity)} article
                                            {arrival.quantity > 1 ? 's' : ''}
                                        </span>
                                    </>
                                }
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <StatutArrivage arrival={arrival} />
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {money(arrival.goodsCost)} de marchandise +{' '}
                                    {money(arrival.extraCosts)} de frais
                                </span>
                            </div>
                        </div>
                    )}
                    empty={
                        <EmptyState
                            icon={Truck}
                            title="Aucun arrivage"
                            description={
                                isFiltered
                                    ? 'Aucun arrivage ne correspond à ces filtres.'
                                    : 'Enregistrez un arrivage pour suivre le coût réel de la marchandise.'
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={arrivals.links}
                            from={arrivals.from}
                            to={arrivals.to}
                            total={arrivals.total}
                            label="arrivages"
                        />
                    }
                />
            </div>
        </>
    );
}

function StatutArrivage({ arrival }: { arrival: ArrivalRow }) {
    return (
        <StatusBadge
            label={arrival.statusLabel}
            tone={arrival.status === 'receptionne' ? 'success' : 'warning'}
        />
    );
}


ArrivagesIndex.layout = {
    breadcrumbs: [{ title: 'Arrivages', href: '/arrivages' }],
};
