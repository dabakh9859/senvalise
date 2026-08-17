import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowDownRight,
    ArrowUpRight,
    Banknote,
    LockKeyhole,
    Receipt,
    Scale,
    Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { DataList, TileHeader } from '@/components/data-list';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { amount, dateTime, money, parseAmount, time } from '@/lib/format';
import { cn } from '@/lib/utils';

type Movement = {
    id: number;
    direction: string;
    categoryLabel: string;
    isPurchase: boolean;
    label: string;
    amount: number;
    paymentLabel: string;
    cashImpact: number;
    supplier: string | null;
    user: string | null;
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
};

type HistoryRow = {
    id: number;
    reference: string;
    openedAt: string | null;
    closedAt: string | null;
    openedBy: string | null;
    closedBy: string | null;
    expectedCash: number | null;
    countedCash: number | null;
    variance: number | null;
};

export default function CaisseIndex({
    session,
    history,
}: {
    session: Session | null;
    history: HistoryRow[];
}) {
    return (
        <>
            <Head title="Caisse" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Caisse"
                    description="Le tiroir de la boutique : fond du matin, mouvements de la journée, comptage du soir."
                    actions={
                        session ? (
                            <FermerCaisse session={session} />
                        ) : (
                            <OuvrirCaisse />
                        )
                    }
                />

                {session ? (
                    <SessionOuverte session={session} />
                ) : (
                    <EmptyState
                        icon={Wallet}
                        title="Aucune caisse ouverte"
                        description="Ouvrez la caisse avec le fond du matin pour commencer à suivre les encaissements et les dépenses de la journée."
                    />
                )}

                <Historique rows={history} />
            </div>
        </>
    );
}

/* -------------------------------------------------------------------------- */

function SessionOuverte({ session }: { session: Session }) {
    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Attendu en caisse"
                    value={money(session.expectedCash)}
                    hint={`Fond ${amount(session.openingFloat)} + espèces − sorties`}
                    icon={Wallet}
                    tone="info"
                />
                <StatCard
                    label="Encaissé (tous moyens)"
                    value={money(session.salesTotal)}
                    hint={`${session.salesCount} vente${session.salesCount > 1 ? 's' : ''} depuis l'ouverture`}
                    icon={Receipt}
                />
                <StatCard
                    label="Achats du jour"
                    value={money(session.purchases)}
                    hint={
                        session.outgoing > session.purchases
                            ? `${money(session.outgoing - session.purchases)} d'autres dépenses`
                            : 'Marchandise et fournitures'
                    }
                    icon={Banknote}
                    tone={session.purchases > 0 ? 'warning' : 'default'}
                />
                <StatCard
                    label="Ouverte depuis"
                    value={time(session.openedAt)}
                    hint={
                        session.openedBy
                            ? `Par ${session.openedBy}`
                            : session.reference
                    }
                    icon={LockKeyhole}
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <div className="rounded-xl border bg-card shadow-sm">
                    <div className="flex items-center justify-between gap-3 border-b p-4">
                        <div>
                            <h2 className="font-medium">
                                Mouvements de la caisse
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Achats, dépenses, apports et prélèvements depuis
                                l'ouverture.
                            </p>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/achats">Saisir un achat</Link>
                        </Button>
                    </div>

                    {session.movements.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground">
                            Rien n'est encore sorti ni entré en dehors des
                            ventes.
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
                                                {row.supplier
                                                    ? ` · ${row.supplier}`
                                                    : ''}
                                            </span>
                                        </>
                                    ),
                                },
                                {
                                    key: 'heure',
                                    header: 'Heure',
                                    hideBelow: 'xl',
                                    className:
                                        'text-sm text-muted-foreground whitespace-nowrap',
                                    cell: (row) => time(row.occurredAt),
                                },
                                {
                                    key: 'paiement',
                                    header: 'Paiement',
                                    hideBelow: 'xl',
                                    className: 'text-sm text-muted-foreground',
                                    cell: (row) => row.paymentLabel,
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

                <div className="flex flex-col gap-4">
                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <h2 className="font-medium">Par moyen de paiement</h2>
                        <p className="mb-3 text-sm text-muted-foreground">
                            De quoi rapprocher le relevé Wave ou Orange Money.
                        </p>

                        {session.byMethod.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Aucune vente depuis l'ouverture.
                            </p>
                        ) : (
                            <ul className="divide-y text-sm">
                                {session.byMethod.map((row) => (
                                    <li
                                        key={row.method}
                                        className="flex items-center justify-between gap-3 py-2"
                                    >
                                        <span>
                                            {row.label}
                                            <span className="ml-1 text-muted-foreground">
                                                ({row.count})
                                            </span>
                                        </span>
                                        <span className="font-medium tabular-nums">
                                            {amount(row.total)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <h2 className="font-medium">Détail du théorique</h2>
                        <ul className="mt-3 divide-y text-sm">
                            <Ligne
                                label="Fond de caisse"
                                value={session.openingFloat}
                            />
                            <Ligne
                                label="Ventes en espèces"
                                value={session.cashSales}
                                sign="+"
                            />
                            <Ligne
                                label="Entrées"
                                value={session.incoming}
                                sign="+"
                            />
                            <Ligne
                                label="Sorties"
                                value={session.outgoing}
                                sign="−"
                            />
                            <li className="flex items-center justify-between gap-3 pt-2 font-medium">
                                <span>Attendu dans le tiroir</span>
                                <span className="tabular-nums">
                                    {amount(session.expectedCash)}
                                </span>
                            </li>
                        </ul>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Seules les lignes réglées en espèces bougent le
                            tiroir. Un achat payé par Wave reste une dépense du
                            jour mais n'en sort pas.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

function Ligne({
    label,
    value,
    sign,
}: {
    label: string;
    value: number;
    sign?: string;
}) {
    return (
        <li className="flex items-center justify-between gap-3 py-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums">
                {sign ?? ''}
                {amount(value)}
            </span>
        </li>
    );
}

/* -------------------------------------------------------------------------- */

function OuvrirCaisse() {
    const [open, setOpen] = useState(false);
    const form = useForm({ opening_float: '', opening_note: '' });

    function submit(event: React.FormEvent) {
        event.preventDefault();
        router.post(
            '/caisse/ouvrir',
            {
                opening_float: parseAmount(form.data.opening_float),
                opening_note: form.data.opening_note,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setOpen(false);
                    form.reset();
                },
            },
        );
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Wallet className="size-4" />
                    Ouvrir la caisse
                </Button>
            </DialogTrigger>
            <DialogContent>
                <form onSubmit={submit}>
                    <DialogHeader>
                        <DialogTitle>Ouvrir la caisse</DialogTitle>
                        <DialogDescription>
                            Comptez la monnaie déjà présente dans le tiroir :
                            c'est elle qui sert de point de départ au comptage
                            du soir.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="fond">Fond de caisse</Label>
                            <Input
                                id="fond"
                                inputMode="numeric"
                                autoFocus
                                placeholder="20 000"
                                value={form.data.opening_float}
                                onChange={(event) =>
                                    form.setData(
                                        'opening_float',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="note-ouverture">
                                Note (facultatif)
                            </Label>
                            <Textarea
                                id="note-ouverture"
                                rows={2}
                                value={form.data.opening_note}
                                onChange={(event) =>
                                    form.setData(
                                        'opening_note',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="submit">Ouvrir</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function FermerCaisse({ session }: { session: Session }) {
    const [open, setOpen] = useState(false);
    const [counted, setCounted] = useState('');
    const [note, setNote] = useState('');

    const compte = parseAmount(counted);
    // L'écart ne s'affiche qu'une fois un montant saisi : afficher « −45 000 »
    // sur un champ vide donnerait l'impression d'un trou dans la caisse.
    const ecart = counted.trim() === '' ? null : compte - session.expectedCash;

    function submit(event: React.FormEvent) {
        event.preventDefault();
        router.post(
            `/caisse/${session.id}/fermer`,
            { counted_cash: compte, closing_note: note },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setOpen(false);
                    setCounted('');
                    setNote('');
                },
            },
        );
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive">
                    <LockKeyhole className="size-4" />
                    Fermer la caisse
                </Button>
            </DialogTrigger>
            <DialogContent>
                <form onSubmit={submit}>
                    <DialogHeader>
                        <DialogTitle>
                            Fermer la caisse {session.reference}
                        </DialogTitle>
                        <DialogDescription>
                            Comptez les espèces réellement présentes dans le
                            tiroir, sans regarder le théorique : c'est le seul
                            moyen de voir un écart.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="compte">Espèces comptées</Label>
                            <Input
                                id="compte"
                                inputMode="numeric"
                                autoFocus
                                placeholder="0"
                                value={counted}
                                onChange={(event) =>
                                    setCounted(event.target.value)
                                }
                            />
                        </div>

                        {ecart !== null ? (
                            <div
                                className={cn(
                                    'flex items-center justify-between gap-3 rounded-lg border p-3 text-sm',
                                    ecart === 0
                                        ? 'border-emerald-500/30 bg-emerald-500/10'
                                        : 'border-red-500/30 bg-red-500/10',
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    <Scale className="size-4" />
                                    {ecart === 0
                                        ? 'Tiroir juste'
                                        : ecart > 0
                                          ? 'Excédent'
                                          : 'Manquant'}
                                </span>
                                <span className="font-medium tabular-nums">
                                    {money(Math.abs(ecart))}
                                </span>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Attendu : {money(session.expectedCash)}
                            </p>
                        )}

                        <div className="grid gap-2">
                            <Label htmlFor="note-fermeture">
                                Note (facultatif)
                            </Label>
                            <Textarea
                                id="note-fermeture"
                                rows={2}
                                placeholder="Explication d'un écart, incident de la journée…"
                                value={note}
                                onChange={(event) =>
                                    setNote(event.target.value)
                                }
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="submit" variant="destructive">
                            Fermer la caisse
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/* -------------------------------------------------------------------------- */

function Historique({ rows }: { rows: HistoryRow[] }) {
    if (rows.length === 0) {
        return null;
    }

    return (
        <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b p-4">
                <h2 className="font-medium">Dernières caisses fermées</h2>
                <p className="text-sm text-muted-foreground">
                    Un écart isolé arrive. Le même écart tous les jours est un
                    problème de procédure.
                </p>
            </div>

            <DataList
                rows={rows}
                getKey={(row) => row.id}
                tileHref={(row) => `/caisse/${row.id}`}
                tile={(row) => (
                    <TileHeader
                        title={row.reference}
                        subtitle={`Fermée le ${dateTime(row.closedAt)}${row.closedBy ? ` par ${row.closedBy}` : ''}`}
                        trailing={
                            <>
                                <span className="block text-sm font-semibold tabular-nums">
                                    {amount(row.countedCash ?? 0)}
                                </span>
                                <Ecart value={row.variance ?? 0} />
                            </>
                        }
                    />
                )}
                columns={[
                    {
                        key: 'reference',
                        header: 'Caisse',
                        cell: (row) => (
                            <Link
                                href={`/caisse/${row.id}`}
                                className="font-medium hover:underline"
                            >
                                {row.reference}
                            </Link>
                        ),
                    },
                    {
                        key: 'ouverture',
                        header: 'Ouverte',
                        className:
                            'text-sm text-muted-foreground whitespace-nowrap',
                        cell: (row) => dateTime(row.openedAt),
                    },
                    {
                        key: 'fermeture',
                        header: 'Fermée',
                        hideBelow: 'xl',
                        className:
                            'text-sm text-muted-foreground whitespace-nowrap',
                        cell: (row) => dateTime(row.closedAt),
                    },
                    {
                        key: 'par',
                        header: 'Par',
                        hideBelow: 'xl',
                        className: 'text-sm text-muted-foreground',
                        cell: (row) => row.closedBy ?? row.openedBy ?? '—',
                    },
                    {
                        key: 'attendu',
                        header: 'Attendu',
                        align: 'right',
                        hideBelow: 'xl',
                        className: 'text-sm tabular-nums',
                        cell: (row) => amount(row.expectedCash ?? 0),
                    },
                    {
                        key: 'compte',
                        header: 'Compté',
                        align: 'right',
                        className: 'tabular-nums',
                        cell: (row) => amount(row.countedCash ?? 0),
                    },
                    {
                        key: 'ecart',
                        header: 'Écart',
                        align: 'right',
                        cell: (row) => <Ecart value={row.variance ?? 0} />,
                    },
                ]}
            />
        </div>
    );
}

function Ecart({ value }: { value: number }) {
    if (value === 0) {
        return <StatusBadge label="Juste" tone="success" />;
    }

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 font-medium tabular-nums',
                value > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400',
            )}
        >
            {value > 0 ? (
                <ArrowUpRight className="size-3.5" />
            ) : (
                <ArrowDownRight className="size-3.5" />
            )}
            {amount(Math.abs(value))}
        </span>
    );
}

CaisseIndex.layout = {
    breadcrumbs: [{ title: 'Caisse', href: '/caisse' }],
};
