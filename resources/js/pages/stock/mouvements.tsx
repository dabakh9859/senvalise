import { Head, Link } from '@inertiajs/react';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, History } from 'lucide-react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFilters } from '@/hooks/use-filters';
import { dateTime, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Option, Paginated } from '@/types';

type Movement = {
    id: number;
    date: string | null;
    label: string;
    variantId: number;
    type: string;
    typeLabel: string;
    reason: string;
    reasonLabel: string;
    quantity: number;
    before: number;
    after: number;
    user?: string;
    note?: string;
    unitCost?: number;
};

export default function StockMouvements({
    movements,
    filters,
    reasons,
}: {
    movements: Paginated<Movement>;
    filters: Record<string, string | undefined>;
    reasons: Option[];
}) {
    const { values, set, reset, isFiltered } = useFilters('/stock/mouvements', {
        recherche: filters.recherche ?? '',
        motif: filters.motif ?? '',
        du: filters.du ?? '',
        au: filters.au ?? '',
    });

    return (
        <>
            <Head title="Mouvements de stock" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Mouvements de stock"
                    description="Toutes les entrées et sorties, avec leur auteur. Rien n'est modifié : chaque correction ajoute une ligne."
                    actions={
                        <Button asChild variant="outline">
                            <Link href="/stock">
                                <ArrowLeft className="size-4" />
                                Retour au stock
                            </Link>
                        </Button>
                    }
                />

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Article, SKU ou code-barres…"
                    onReset={reset}
                    isFiltered={isFiltered}
                >
                    <FilterSelect
                        value={values.motif}
                        onChange={(value) => set('motif', value, true)}
                        options={reasons}
                        allLabel="Tous les motifs"
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
                    rows={movements.data}
                    getKey={(movement) => movement.id}
                    columns={[
                        {
                            key: 'date',
                            header: 'Date',
                            className:
                                'text-sm whitespace-nowrap text-muted-foreground',
                            cell: (movement) => dateTime(movement.date),
                        },
                        {
                            key: 'article',
                            header: 'Article',
                            className: 'text-sm',
                            cell: (movement) => (
                                <>
                                    {movement.label}
                                    {movement.note ? (
                                        <span className="block text-xs text-muted-foreground">
                                            {movement.note}
                                        </span>
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'motif',
                            header: 'Motif',
                            className: 'text-sm',
                            cell: (movement) => (
                                <>
                                    {movement.reasonLabel}
                                    {movement.unitCost !== undefined ? (
                                        <span className="block text-xs text-muted-foreground">
                                            {money(movement.unitCost)} / unité
                                        </span>
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'variation',
                            header: 'Variation',
                            align: 'right',
                            cell: (movement) => (
                                <Variation movement={movement} />
                            ),
                        },
                        {
                            key: 'avant-apres',
                            header: 'Avant → après',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (movement) => (
                                <>
                                    {movement.before} →{' '}
                                    <span className="font-medium text-foreground">
                                        {movement.after}
                                    </span>
                                </>
                            ),
                        },
                        {
                            key: 'par',
                            header: 'Par',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (movement) => movement.user ?? '—',
                        },
                    ]}
                    tile={(movement) => (
                        <div className="space-y-1.5">
                            <TileHeader
                                title={movement.label}
                                subtitle={`${movement.reasonLabel} · ${dateTime(movement.date)}`}
                                trailing={<Variation movement={movement} />}
                            />
                            <p className="text-xs text-muted-foreground tabular-nums">
                                {movement.before} → {movement.after} en stock
                                {movement.user ? ` · ${movement.user}` : ''}
                            </p>
                            {movement.note ? (
                                <p className="text-xs text-muted-foreground">
                                    {movement.note}
                                </p>
                            ) : null}
                        </div>
                    )}
                    empty={
                        <EmptyState
                            icon={History}
                            title="Aucun mouvement"
                            description={
                                isFiltered
                                    ? 'Aucun mouvement ne correspond à ces filtres.'
                                    : 'Chaque vente, arrivage ou correction laissera une trace ici.'
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={movements.links}
                            from={movements.from}
                            to={movements.to}
                            total={movements.total}
                            label="mouvements"
                        />
                    }
                />
            </div>
        </>
    );
}

/** La variation signée ; la flèche double la couleur. */
function Variation({ movement }: { movement: Movement }) {
    const isIn = movement.quantity > 0;
    const Icon = isIn ? ArrowUpRight : ArrowDownRight;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 font-medium tabular-nums',
                isIn
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400',
            )}
        >
            <Icon className="size-3.5" />
            {isIn ? '+' : ''}
            {movement.quantity}
        </span>
    );
}


StockMouvements.layout = {
    breadcrumbs: [
        { title: 'Stock', href: '/stock' },
        { title: 'Mouvements', href: '/stock/mouvements' },
    ],
};
