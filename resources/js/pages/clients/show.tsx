import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Mail,
    MapPin,
    PackageCheck,
    Phone,
    PiggyBank,
    Receipt,
    RotateCcw,
    ShoppingBag,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import { DataList, TileHeader } from '@/components/data-list';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { amount, date, dateTime, money } from '@/lib/format';

type Customer = {
    id: number;
    type: string;
    name: string;
    displayName: string;
    companyName: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    ninea: string | null;
    notes: string | null;
    isActive: boolean;
    whatsappOptIn: boolean;
    hasWebAccount: boolean;
    since: string | null;
};

type Summary = {
    revenue: number;
    salesCount: number;
    averageBasket: number;
    outstanding: number;
    lastPurchase: string | null;
    returnsCount: number;
    returnsAmount: number;
    openCredit: number;
    margin: number | null;
};

export default function ClientShow({
    customer,
    summary,
    sales,
    documents,
    returns,
    orders,
    vaults,
    canOpenShop,
}: {
    customer: Customer;
    summary: Summary;
    sales: Array<{
        id: number;
        reference: string;
        soldAt: string | null;
        total: number;
        amountPaid: number;
        balance: number;
        status: string;
        paymentLabel: string;
        itemCount: number;
        summary: string;
    }>;
    documents: Array<{
        id: number;
        reference: string;
        typeLabel: string;
        statusLabel: string;
        status: string;
        issueDate: string | null;
        total: number;
        balance: number;
    }>;
    returns: Array<{
        id: number;
        reference: string;
        returnedAt: string | null;
        reasonLabel: string;
        refundLabel: string;
        totalRefund: number;
        isOpenCredit: boolean;
    }>;
    orders: Array<{
        id: number;
        reference: string;
        placedAt: string | null;
        status: string;
        total: number;
    }>;
    vaults: Array<{
        id: number;
        reference: string;
        target: number;
        saved: number;
        status: string;
    }>;
    canOpenShop: boolean;
}) {
    return (
        <>
            <Head title={customer.displayName} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={customer.displayName}
                    description={
                        customer.since
                            ? `Client depuis le ${date(customer.since)}.`
                            : undefined
                    }
                    actions={
                        <>
                            <Button variant="outline" asChild>
                                <Link href="/clients">
                                    <ArrowLeft className="size-4" />
                                    Tous les clients
                                </Link>
                            </Button>
                            <Button asChild>
                                <Link href="/documents?vente=1">
                                    <ShoppingBag className="size-4" />
                                    Nouvelle vente
                                </Link>
                            </Button>
                        </>
                    }
                />

                <Identite customer={customer} />

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Chiffre d'affaires"
                        value={money(summary.revenue)}
                        hint={`${summary.salesCount} achat${summary.salesCount > 1 ? 's' : ''}`}
                        icon={TrendingUp}
                        tone="info"
                    />
                    <StatCard
                        label="Panier moyen"
                        value={money(summary.averageBasket)}
                        hint={
                            summary.lastPurchase
                                ? `Dernier achat le ${date(summary.lastPurchase)}`
                                : 'Aucun achat'
                        }
                        icon={Receipt}
                    />
                    <StatCard
                        label="Reste à encaisser"
                        value={money(summary.outstanding)}
                        hint="Ventes à crédit et factures impayées"
                        icon={Wallet}
                        tone={summary.outstanding > 0 ? 'danger' : 'success'}
                    />
                    {summary.margin !== null ? (
                        <StatCard
                            label="Marge dégagée"
                            value={money(summary.margin)}
                            hint="Sur les achats enregistrés"
                            tone="success"
                        />
                    ) : (
                        <StatCard
                            label="Retours"
                            value={String(summary.returnsCount)}
                            hint={money(summary.returnsAmount)}
                            icon={RotateCcw}
                        />
                    )}
                </div>

                {summary.openCredit > 0 ? (
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm">
                        Ce client dispose de {money(summary.openCredit)} d'avoir
                        non consommé. Pensez à le déduire de son prochain achat.
                    </div>
                ) : null}

                <Bloc
                    titre="Achats en boutique"
                    vide="Aucun achat enregistré."
                    rows={sales}
                >
                    <DataList
                        rows={sales}
                        getKey={(row) => row.id}
                        tileHref={(row) => `/ventes/${row.id}`}
                        tile={(row) => (
                            <TileHeader
                                title={row.reference}
                                subtitle={`${dateTime(row.soldAt)} · ${row.paymentLabel}`}
                                trailing={
                                    <>
                                        <span className="block text-sm font-semibold tabular-nums">
                                            {amount(row.total)}
                                        </span>
                                        {row.balance > 0 ? (
                                            <span className="block text-xs text-red-600 dark:text-red-400">
                                                {amount(row.balance)} dû
                                            </span>
                                        ) : null}
                                    </>
                                }
                            />
                        )}
                        columns={[
                            {
                                key: 'ticket',
                                header: 'Ticket',
                                cell: (row) => (
                                    <>
                                        <Link
                                            href={`/ventes/${row.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {row.reference}
                                        </Link>
                                        {row.status !== 'validee' ? (
                                            <StatusBadge
                                                label="Annulée"
                                                tone="danger"
                                                className="ml-2"
                                            />
                                        ) : null}
                                        <span className="block text-xs text-muted-foreground">
                                            {row.summary}
                                        </span>
                                    </>
                                ),
                            },
                            {
                                key: 'date',
                                header: 'Date',
                                className:
                                    'text-sm whitespace-nowrap text-muted-foreground',
                                cell: (row) => dateTime(row.soldAt),
                            },
                            {
                                key: 'paiement',
                                header: 'Paiement',
                                hideBelow: 'xl',
                                className: 'text-sm text-muted-foreground',
                                cell: (row) => row.paymentLabel,
                            },
                            {
                                key: 'reste',
                                header: 'Reste dû',
                                align: 'right',
                                hideBelow: 'xl',
                                className: 'text-sm tabular-nums',
                                cell: (row) =>
                                    row.balance > 0 ? (
                                        <span className="text-red-600 dark:text-red-400">
                                            {amount(row.balance)}
                                        </span>
                                    ) : (
                                        '—'
                                    ),
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
                </Bloc>

                <div className="grid gap-4 xl:grid-cols-2">
                    <Bloc
                        titre="Factures et devis"
                        vide="Aucun document."
                        rows={documents}
                    >
                        <DataList
                            rows={documents}
                            getKey={(row) => row.id}
                            tileHref={(row) => `/documents/${row.id}`}
                            tile={(row) => (
                                <TileHeader
                                    title={row.reference}
                                    subtitle={`${row.typeLabel} · ${row.statusLabel} · ${date(row.issueDate)}`}
                                    trailing={
                                        <span className="text-sm font-semibold tabular-nums">
                                            {amount(row.total)}
                                        </span>
                                    }
                                />
                            )}
                            columns={[
                                {
                                    key: 'numero',
                                    header: 'Document',
                                    cell: (row) => (
                                        <>
                                            <Link
                                                href={`/documents/${row.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {row.reference}
                                            </Link>
                                            <span className="block text-xs text-muted-foreground">
                                                {row.typeLabel} ·{' '}
                                                {row.statusLabel}
                                            </span>
                                        </>
                                    ),
                                },
                                {
                                    key: 'date',
                                    header: 'Émis le',
                                    className:
                                        'text-sm text-muted-foreground whitespace-nowrap',
                                    cell: (row) => date(row.issueDate),
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
                    </Bloc>

                    <Bloc titre="Retours" vide="Aucun retour." rows={returns}>
                        <DataList
                            rows={returns}
                            getKey={(row) => row.id}
                            tileHref={(row) => `/retours/${row.id}`}
                            tile={(row) => (
                                <TileHeader
                                    title={row.reference}
                                    subtitle={`${row.reasonLabel} · ${date(row.returnedAt)}`}
                                    trailing={
                                        <span className="text-sm font-semibold tabular-nums">
                                            {amount(row.totalRefund)}
                                        </span>
                                    }
                                />
                            )}
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
                                            <span className="block text-xs text-muted-foreground">
                                                {row.reasonLabel} ·{' '}
                                                {row.refundLabel}
                                            </span>
                                        </>
                                    ),
                                },
                                {
                                    key: 'date',
                                    header: 'Date',
                                    className:
                                        'text-sm text-muted-foreground whitespace-nowrap',
                                    cell: (row) => date(row.returnedAt),
                                },
                                {
                                    key: 'montant',
                                    header: 'Rendu',
                                    align: 'right',
                                    className: 'font-medium tabular-nums',
                                    cell: (row) => amount(row.totalRefund),
                                },
                            ]}
                        />
                    </Bloc>
                </div>

                {canOpenShop && (orders.length > 0 || vaults.length > 0) ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                        <Bloc
                            titre="Commandes en ligne"
                            vide="Aucune commande."
                            rows={orders}
                            icone={PackageCheck}
                        >
                            <DataList
                                rows={orders}
                                getKey={(row) => row.id}
                                tileHref={(row) => `/commandes/${row.id}`}
                                tile={(row) => (
                                    <TileHeader
                                        title={row.reference}
                                        subtitle={date(row.placedAt)}
                                        trailing={
                                            <span className="text-sm font-semibold tabular-nums">
                                                {amount(row.total)}
                                            </span>
                                        }
                                    />
                                )}
                                columns={[
                                    {
                                        key: 'reference',
                                        header: 'Commande',
                                        cell: (row) => (
                                            <Link
                                                href={`/commandes/${row.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {row.reference}
                                            </Link>
                                        ),
                                    },
                                    {
                                        key: 'date',
                                        header: 'Passée le',
                                        className:
                                            'text-sm text-muted-foreground whitespace-nowrap',
                                        cell: (row) => date(row.placedAt),
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
                        </Bloc>

                        <Bloc
                            titre="Coffres"
                            vide="Aucun coffre."
                            rows={vaults}
                            icone={PiggyBank}
                        >
                            <DataList
                                rows={vaults}
                                getKey={(row) => row.id}
                                tileHref={(row) => `/coffres/${row.id}`}
                                tile={(row) => (
                                    <TileHeader
                                        title={row.reference}
                                        subtitle={`${amount(row.saved)} sur ${amount(row.target)}`}
                                        trailing={
                                            <span className="text-sm font-semibold tabular-nums">
                                                {amount(row.saved)}
                                            </span>
                                        }
                                    />
                                )}
                                columns={[
                                    {
                                        key: 'reference',
                                        header: 'Coffre',
                                        cell: (row) => (
                                            <Link
                                                href={`/coffres/${row.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {row.reference}
                                            </Link>
                                        ),
                                    },
                                    {
                                        key: 'epargne',
                                        header: 'Épargné',
                                        align: 'right',
                                        className: 'tabular-nums',
                                        cell: (row) =>
                                            `${amount(row.saved)} / ${amount(row.target)}`,
                                    },
                                ]}
                            />
                        </Bloc>
                    </div>
                ) : null}
            </div>
        </>
    );
}

/* -------------------------------------------------------------------------- */

function Identite({ customer }: { customer: Customer }) {
    return (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm shadow-sm">
            {customer.phone ? (
                <a
                    href={`tel:${customer.phone}`}
                    className="inline-flex items-center gap-2 hover:underline"
                >
                    <Phone className="size-4 text-muted-foreground" />
                    {customer.phone}
                </a>
            ) : null}
            {customer.email ? (
                <a
                    href={`mailto:${customer.email}`}
                    className="inline-flex items-center gap-2 hover:underline"
                >
                    <Mail className="size-4 text-muted-foreground" />
                    {customer.email}
                </a>
            ) : null}
            {customer.address || customer.city ? (
                <span className="inline-flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" />
                    {[customer.address, customer.city]
                        .filter(Boolean)
                        .join(', ')}
                </span>
            ) : null}
            {customer.ninea ? (
                <span className="text-muted-foreground">
                    NINEA {customer.ninea}
                </span>
            ) : null}
            {customer.whatsappOptIn ? (
                <StatusBadge label="WhatsApp accepté" tone="success" />
            ) : null}
            {customer.hasWebAccount ? (
                <StatusBadge label="Compte en ligne" tone="info" />
            ) : null}
            {!customer.isActive ? (
                <StatusBadge label="Fiche inactive" tone="danger" />
            ) : null}
            {customer.notes ? (
                <span className="w-full text-muted-foreground">
                    {customer.notes}
                </span>
            ) : null}
        </div>
    );
}

function Bloc({
    titre,
    vide,
    rows,
    children,
    icone: Icone,
}: {
    titre: string;
    vide: string;
    rows: unknown[];
    children: React.ReactNode;
    icone?: typeof PiggyBank;
}) {
    return (
        <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b p-4">
                {Icone ? (
                    <Icone className="size-4 text-muted-foreground" />
                ) : null}
                <h2 className="font-medium">{titre}</h2>
            </div>
            {rows.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">{vide}</p>
            ) : (
                children
            )}
        </div>
    );
}

ClientShow.layout = {
    breadcrumbs: [
        { title: 'Clients', href: '/clients' },
        { title: 'Fiche', href: '#' },
    ],
};
