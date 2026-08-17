import { Head, Link } from '@inertiajs/react';
import { Plus, RotateCcw, Ticket, Wallet } from 'lucide-react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useFilters } from '@/hooks/use-filters';
import { amount, count, dateTime, money } from '@/lib/format';
import type { Option, Paginated } from '@/types';

type ReturnRow = {
    id: number;
    reference: string;
    returnedAt: string | null;
    customer: string | null;
    customerId: number | null;
    saleReference: string | null;
    saleId: number | null;
    reasonLabel: string;
    refundLabel: string;
    totalRefund: number;
    itemCount: number;
    restockedCount: number;
    isOpenCredit: boolean;
    user: string | null;
};

export default function RetoursIndex({
    returns,
    filters,
    reasons,
    stats,
}: {
    returns: Paginated<ReturnRow>;
    filters: Record<string, string | undefined>;
    reasons: Option[];
    stats: {
        monthCount: number;
        monthRefund: number;
        openCredits: number;
        openCreditCount: number;
    };
}) {
    const { values, set, reset, isFiltered } = useFilters('/retours', {
        recherche: filters.recherche ?? '',
        motif: filters.motif ?? '',
    });

    return (
        <>
            <Head title="Retours client" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Retours client"
                    description="Marchandise rendue, remise en stock et dédommagement."
                    actions={
                        <Button asChild>
                            <Link href="/retours/nouveau">
                                <Plus className="size-4" />
                                Nouveau retour
                            </Link>
                        </Button>
                    }
                />

                <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                        label="Retours ce mois"
                        value={count(stats.monthCount)}
                        icon={RotateCcw}
                    />
                    <StatCard
                        label="Remboursé ce mois"
                        value={money(stats.monthRefund)}
                        tone="warning"
                    />
                    <StatCard
                        label="Avoirs en cours"
                        value={money(stats.openCredits)}
                        hint={`${stats.openCreditCount} avoir${stats.openCreditCount > 1 ? 's' : ''} non consommé${stats.openCreditCount > 1 ? 's' : ''}`}
                        icon={Wallet}
                        tone={stats.openCredits > 0 ? 'info' : 'default'}
                    />
                </div>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Numéro de retour, ticket, client…"
                    onReset={reset}
                    isFiltered={isFiltered}
                >
                    <FilterSelect
                        value={values.motif}
                        onChange={(value) => set('motif', value, true)}
                        options={reasons}
                        allLabel="Tous motifs"
                        width="sm:w-52"
                    />
                </FilterBar>

                <DataList
                    rows={returns.data}
                    getKey={(row) => row.id}
                    tileHref={(row) => `/retours/${row.id}`}
                    tile={(row) => (
                        <TileHeader
                            title={row.reference}
                            subtitle={`${row.customer ?? 'Client de passage'} · ${row.reasonLabel}`}
                            trailing={
                                <>
                                    <span className="block text-sm font-semibold tabular-nums">
                                        {amount(row.totalRefund)}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        {row.refundLabel}
                                    </span>
                                </>
                            }
                        />
                    )}
                    empty={
                        <EmptyState
                            icon={RotateCcw}
                            title="Aucun retour"
                            description="Les retours enregistrés au comptoir apparaîtront ici."
                        />
                    }
                    columns={[
                        {
                            key: 'reference',
                            header: 'Retour',
                            cell: (row) => (
                                <>
                                    <Link
                                        href={`/retours/${row.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {row.reference}
                                    </Link>
                                    {row.isOpenCredit ? (
                                        <StatusBadge
                                            label="Avoir en cours"
                                            tone="info"
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
                            cell: (row) => dateTime(row.returnedAt),
                        },
                        {
                            key: 'client',
                            header: 'Client',
                            className: 'text-sm',
                            cell: (row) =>
                                row.customerId ? (
                                    <Link
                                        href={`/clients/${row.customerId}`}
                                        className="hover:underline"
                                    >
                                        {row.customer}
                                    </Link>
                                ) : (
                                    <span className="text-muted-foreground">
                                        Client de passage
                                    </span>
                                ),
                        },
                        {
                            key: 'vente',
                            header: 'Ticket',
                            hideBelow: 'xl',
                            className: 'text-sm',
                            cell: (row) =>
                                row.saleId ? (
                                    <Link
                                        href={`/ventes/${row.saleId}`}
                                        className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                                    >
                                        <Ticket className="size-3.5" />
                                        {row.saleReference}
                                    </Link>
                                ) : (
                                    <span className="text-muted-foreground">
                                        Sans ticket
                                    </span>
                                ),
                        },
                        {
                            key: 'motif',
                            header: 'Motif',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (row) => row.reasonLabel,
                        },
                        {
                            key: 'articles',
                            header: 'Articles',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm tabular-nums',
                            cell: (row) => (
                                <>
                                    {row.itemCount}
                                    {row.restockedCount < row.itemCount ? (
                                        <span className="block text-xs text-muted-foreground">
                                            {row.restockedCount} remis en stock
                                        </span>
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'dedommagement',
                            header: 'Dédommagement',
                            align: 'right',
                            className: 'font-medium tabular-nums',
                            cell: (row) => (
                                <>
                                    {amount(row.totalRefund)}
                                    <span className="block text-xs font-normal text-muted-foreground">
                                        {row.refundLabel}
                                    </span>
                                </>
                            ),
                        },
                    ]}
                    footer={
                        <DataPagination
                            links={returns.links}
                            from={returns.from}
                            to={returns.to}
                            total={returns.total}
                            label="retours"
                        />
                    }
                />
            </div>
        </>
    );
}

RetoursIndex.layout = {
    breadcrumbs: [{ title: 'Retours', href: '/retours' }],
};
