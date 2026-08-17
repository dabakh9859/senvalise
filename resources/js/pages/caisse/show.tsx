import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Receipt, Scale, Wallet } from 'lucide-react';
import { DataList, TileHeader } from '@/components/data-list';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { amount, dateTime, money, time } from '@/lib/format';
import { cn } from '@/lib/utils';

type Movement = {
    id: number;
    direction: string;
    categoryLabel: string;
    label: string;
    amount: number;
    paymentLabel: string;
    supplier: string | null;
    occurredAt: string | null;
};

type Session = {
    id: number;
    reference: string;
    status: string;
    statusLabel: string;
    openedAt: string | null;
    openedBy: string | null;
    openingFloat: number;
    openingNote: string | null;
    closedAt: string | null;
    closedBy: string | null;
    countedCash: number | null;
    variance: number | null;
    closingNote: string | null;
    expectedCash: number;
    cashSales: number;
    salesTotal: number;
    salesCount: number;
    byMethod: Array<{
        method: string;
        label: string;
        count: number;
        total: number;
    }>;
    outgoing: number;
    incoming: number;
    purchases: number;
    movements: Movement[];
    sales: Array<{
        id: number;
        reference: string;
        total: number;
        paymentMethod: string;
        soldAt: string | null;
    }>;
};

export default function CaisseShow({ session }: { session: Session }) {
    const variance = session.variance ?? 0;

    return (
        <>
            <Head title={`Caisse ${session.reference}`} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={`Caisse ${session.reference}`}
                    description={`Ouverte le ${dateTime(session.openedAt)}${
                        session.closedAt
                            ? `, fermée le ${dateTime(session.closedAt)}`
                            : ''
                    }.`}
                    actions={
                        <Button variant="outline" asChild>
                            <Link href="/caisse">
                                <ArrowLeft className="size-4" />
                                Retour à la caisse
                            </Link>
                        </Button>
                    }
                />

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Attendu"
                        value={money(session.expectedCash)}
                        hint={`Fond ${amount(session.openingFloat)}`}
                        icon={Wallet}
                    />
                    <StatCard
                        label="Compté"
                        value={money(session.countedCash ?? 0)}
                        hint={
                            session.closedBy
                                ? `Par ${session.closedBy}`
                                : 'Caisse encore ouverte'
                        }
                        icon={Scale}
                    />
                    <StatCard
                        label="Écart"
                        value={money(Math.abs(variance))}
                        hint={
                            variance === 0
                                ? 'Tiroir juste'
                                : variance > 0
                                  ? 'Excédent constaté'
                                  : 'Manquant constaté'
                        }
                        tone={
                            variance === 0
                                ? 'success'
                                : variance > 0
                                  ? 'warning'
                                  : 'danger'
                        }
                    />
                    <StatCard
                        label="Encaissé"
                        value={money(session.salesTotal)}
                        hint={`${session.salesCount} vente${session.salesCount > 1 ? 's' : ''}`}
                        icon={Receipt}
                    />
                </div>

                {session.closingNote || session.openingNote ? (
                    <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
                        {session.openingNote ? (
                            <p>
                                <span className="text-muted-foreground">
                                    À l'ouverture :{' '}
                                </span>
                                {session.openingNote}
                            </p>
                        ) : null}
                        {session.closingNote ? (
                            <p className="mt-1">
                                <span className="text-muted-foreground">
                                    À la fermeture :{' '}
                                </span>
                                {session.closingNote}
                            </p>
                        ) : null}
                    </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border bg-card shadow-sm">
                        <div className="border-b p-4">
                            <h2 className="font-medium">Mouvements</h2>
                        </div>
                        {session.movements.length === 0 ? (
                            <p className="p-6 text-sm text-muted-foreground">
                                Aucun mouvement en dehors des ventes.
                            </p>
                        ) : (
                            <DataList
                                rows={session.movements}
                                getKey={(row) => row.id}
                                tile={(row) => (
                                    <TileHeader
                                        title={row.label}
                                        subtitle={`${row.categoryLabel} · ${time(row.occurredAt)}`}
                                        trailing={
                                            <span
                                                className={cn(
                                                    'text-sm font-semibold tabular-nums',
                                                    row.direction === 'sortie'
                                                        ? 'text-red-600 dark:text-red-400'
                                                        : 'text-emerald-600 dark:text-emerald-400',
                                                )}
                                            >
                                                {row.direction === 'sortie'
                                                    ? '−'
                                                    : '+'}
                                                {amount(row.amount)}
                                            </span>
                                        }
                                    />
                                )}
                                columns={[
                                    {
                                        key: 'libelle',
                                        header: 'Libellé',
                                        cell: (row) => (
                                            <>
                                                <span className="font-medium">
                                                    {row.label}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {row.categoryLabel}
                                                </span>
                                            </>
                                        ),
                                    },
                                    {
                                        key: 'heure',
                                        header: 'Heure',
                                        className:
                                            'text-sm text-muted-foreground',
                                        cell: (row) => time(row.occurredAt),
                                    },
                                    {
                                        key: 'montant',
                                        header: 'Montant',
                                        align: 'right',
                                        className: 'font-medium tabular-nums',
                                        cell: (row) => (
                                            <span
                                                className={cn(
                                                    row.direction === 'sortie'
                                                        ? 'text-red-600 dark:text-red-400'
                                                        : 'text-emerald-600 dark:text-emerald-400',
                                                )}
                                            >
                                                {row.direction === 'sortie'
                                                    ? '−'
                                                    : '+'}
                                                {amount(row.amount)}
                                            </span>
                                        ),
                                    },
                                ]}
                            />
                        )}
                    </div>

                    <div className="rounded-xl border bg-card shadow-sm">
                        <div className="flex items-center justify-between border-b p-4">
                            <h2 className="font-medium">
                                Ventes de la session
                            </h2>
                            <StatusBadge
                                label={session.statusLabel}
                                tone={
                                    session.status === 'ouverte'
                                        ? 'info'
                                        : 'neutral'
                                }
                            />
                        </div>
                        {session.sales.length === 0 ? (
                            <p className="p-6 text-sm text-muted-foreground">
                                Aucune vente sur cette session.
                            </p>
                        ) : (
                            <DataList
                                rows={session.sales}
                                getKey={(row) => row.id}
                                tileHref={(row) => `/ventes/${row.id}`}
                                tile={(row) => (
                                    <TileHeader
                                        title={row.reference}
                                        subtitle={`${time(row.soldAt)} · ${row.paymentMethod}`}
                                        trailing={
                                            <span className="text-sm font-semibold tabular-nums">
                                                {amount(row.total)}
                                            </span>
                                        }
                                    />
                                )}
                                columns={[
                                    {
                                        key: 'ticket',
                                        header: 'Ticket',
                                        cell: (row) => (
                                            <Link
                                                href={`/ventes/${row.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {row.reference}
                                            </Link>
                                        ),
                                    },
                                    {
                                        key: 'heure',
                                        header: 'Heure',
                                        className:
                                            'text-sm text-muted-foreground',
                                        cell: (row) => time(row.soldAt),
                                    },
                                    {
                                        key: 'paiement',
                                        header: 'Paiement',
                                        hideBelow: 'xl',
                                        className:
                                            'text-sm text-muted-foreground',
                                        cell: (row) => row.paymentMethod,
                                    },
                                    {
                                        key: 'total',
                                        header: 'Total',
                                        align: 'right',
                                        className: 'font-medium tabular-nums',
                                        cell: (row) => amount(row.total),
                                    },
                                ]}
                            />
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

CaisseShow.layout = {
    breadcrumbs: [
        { title: 'Caisse', href: '/caisse' },
        { title: 'Détail', href: '#' },
    ],
};
