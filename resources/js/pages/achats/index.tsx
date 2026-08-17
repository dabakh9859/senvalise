import { Head, Link, router } from '@inertiajs/react';
import {
    Banknote,
    CalendarDays,
    Plus,
    Trash2,
    TrendingDown,
    Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataList, TileHeader } from '@/components/data-list';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { amount, money, parseAmount, time } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IdOption, Option } from '@/types';

type Movement = {
    id: number;
    direction: string;
    category: string;
    categoryLabel: string;
    isPurchase: boolean;
    label: string;
    amount: number;
    paymentMethod: string;
    paymentLabel: string;
    cashImpact: number;
    supplier: string | null;
    user: string | null;
    occurredAt: string | null;
    note: string | null;
};

type CategoryOption = Option & { direction: string };

export default function AchatsIndex({
    day,
    dayLabel,
    isToday,
    movements,
    totals,
    byCategory,
    month,
    categories,
    paymentMethods,
    suppliers,
    hasOpenSession,
    canManage,
}: {
    day: string;
    dayLabel: string;
    isToday: boolean;
    movements: Movement[];
    totals: {
        outgoing: number;
        incoming: number;
        purchases: number;
        cashImpact: number;
    };
    byCategory: Array<{
        key: string;
        label: string;
        total: number;
        count: number;
    }>;
    month: { label: string; outgoing: number; purchases: number };
    categories: CategoryOption[];
    paymentMethods: Option[];
    suppliers: IdOption[];
    hasOpenSession: boolean;
    canManage: boolean;
}) {
    return (
        <>
            <Head title="Achats du jour" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Achats et dépenses du jour"
                    description="Tout ce qui sort ou entre en dehors des ventes : marchandise rachetée, fournitures, transport, apports."
                    actions={
                        <SaisirMouvement
                            categories={categories}
                            paymentMethods={paymentMethods}
                            suppliers={suppliers}
                            day={day}
                            isToday={isToday}
                        />
                    }
                />

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <CalendarDays className="size-4 text-muted-foreground" />
                        <Input
                            type="date"
                            value={day}
                            onChange={(event) =>
                                router.get(
                                    '/achats',
                                    { jour: event.target.value },
                                    { preserveState: true, replace: true },
                                )
                            }
                            className="h-9 w-44"
                            aria-label="Jour"
                        />
                    </div>
                    <span className="text-sm text-muted-foreground capitalize">
                        {dayLabel}
                    </span>
                    {!hasOpenSession && isToday ? (
                        <span className="text-sm text-amber-600 dark:text-amber-400">
                            Aucune caisse ouverte : la dépense sera enregistrée
                            sans être rattachée à un tiroir.{' '}
                            <Link href="/caisse" className="underline">
                                Ouvrir la caisse
                            </Link>
                        </span>
                    ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Achats du jour"
                        value={money(totals.purchases)}
                        hint="Marchandise et fournitures"
                        icon={Banknote}
                        tone={totals.purchases > 0 ? 'warning' : 'default'}
                    />
                    <StatCard
                        label="Total des sorties"
                        value={money(totals.outgoing)}
                        hint="Achats, charges et prélèvements"
                        icon={TrendingDown}
                    />
                    <StatCard
                        label="Effet sur le tiroir"
                        value={money(totals.cashImpact)}
                        hint="Seules les lignes en espèces comptent"
                        icon={Wallet}
                        tone={totals.cashImpact < 0 ? 'danger' : 'default'}
                    />
                    <StatCard
                        label={`Depuis le 1er ${month.label}`}
                        value={money(month.outgoing)}
                        hint={`Dont ${money(month.purchases)} d'achats`}
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                    <div className="rounded-xl border bg-card shadow-sm">
                        <div className="border-b p-4">
                            <h2 className="font-medium">Mouvements du jour</h2>
                        </div>

                        {movements.length === 0 ? (
                            <p className="p-6 text-sm text-muted-foreground">
                                Rien n'a été saisi pour cette journée.
                            </p>
                        ) : (
                            <DataList
                                rows={movements}
                                getKey={(row) => row.id}
                                tile={(row) => (
                                    <TileHeader
                                        title={row.label}
                                        subtitle={`${row.categoryLabel} · ${row.paymentLabel} · ${time(row.occurredAt)}`}
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
                                                    {row.user
                                                        ? ` · ${row.user}`
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
                                        className:
                                            'text-sm text-muted-foreground',
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
                                    ...(canManage
                                        ? [
                                              {
                                                  key: 'actions',
                                                  header: '',
                                                  align: 'right' as const,
                                                  cell: (row: Movement) => (
                                                      <Button
                                                          variant="ghost"
                                                          size="icon"
                                                          aria-label="Supprimer"
                                                          onClick={() =>
                                                              router.delete(
                                                                  `/achats/${row.id}`,
                                                                  {
                                                                      preserveScroll: true,
                                                                  },
                                                              )
                                                          }
                                                      >
                                                          <Trash2 className="size-4" />
                                                      </Button>
                                                  ),
                                              },
                                          ]
                                        : []),
                                ]}
                            />
                        )}
                    </div>

                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <h2 className="font-medium">Répartition des sorties</h2>
                        {byCategory.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">
                                Aucune sortie ce jour.
                            </p>
                        ) : (
                            <ul className="mt-3 divide-y text-sm">
                                {byCategory.map((row) => (
                                    <li
                                        key={row.key}
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
                </div>
            </div>
        </>
    );
}

/* -------------------------------------------------------------------------- */

function SaisirMouvement({
    categories,
    paymentMethods,
    suppliers,
    day,
    isToday,
}: {
    categories: CategoryOption[];
    paymentMethods: Option[];
    suppliers: IdOption[];
    day: string;
    isToday: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState('achat_marchandise');
    const [label, setLabel] = useState('');
    const [value, setValue] = useState('');
    const [payment, setPayment] = useState('especes');
    const [supplier, setSupplier] = useState('');
    const [note, setNote] = useState('');

    const direction = useMemo(
        () =>
            categories.find((option) => option.value === category)?.direction ??
            'sortie',
        [categories, category],
    );

    const sorties = categories.filter(
        (option) => option.direction === 'sortie',
    );
    const entrees = categories.filter(
        (option) => option.direction === 'entree',
    );

    function submit(event: React.FormEvent) {
        event.preventDefault();
        router.post(
            '/achats',
            {
                category,
                label,
                amount: parseAmount(value),
                payment_method: payment,
                supplier_id: supplier === '' ? null : Number(supplier),
                // Une saisie faite en consultant une journée passée doit tomber
                // sur cette journée-là, pas sur aujourd'hui.
                occurred_at: isToday ? null : `${day} 12:00:00`,
                note,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setOpen(false);
                    setLabel('');
                    setValue('');
                    setSupplier('');
                    setNote('');
                },
            },
        );
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="size-4" />
                    Saisir une dépense
                </Button>
            </DialogTrigger>
            <DialogContent>
                <form onSubmit={submit}>
                    <DialogHeader>
                        <DialogTitle>
                            {direction === 'sortie'
                                ? 'Nouvelle dépense'
                                : 'Nouvelle entrée'}
                        </DialogTitle>
                        <DialogDescription>
                            Le sens du mouvement découle de la catégorie choisie
                            : un loyer sort, un apport entre.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="categorie">Catégorie</Label>
                            <Select
                                value={category}
                                onValueChange={setCategory}
                            >
                                <SelectTrigger id="categorie">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {sorties.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                    {entrees.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="libelle">Libellé</Label>
                            <Input
                                id="libelle"
                                autoFocus
                                placeholder="Carton de housses, taxi livraison…"
                                value={label}
                                onChange={(event) =>
                                    setLabel(event.target.value)
                                }
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="montant">Montant</Label>
                                <Input
                                    id="montant"
                                    inputMode="numeric"
                                    placeholder="15 000"
                                    value={value}
                                    onChange={(event) =>
                                        setValue(event.target.value)
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="paiement">Réglé par</Label>
                                <Select
                                    value={payment}
                                    onValueChange={setPayment}
                                >
                                    <SelectTrigger id="paiement">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {paymentMethods.map((option) => (
                                            <SelectItem
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {suppliers.length > 0 ? (
                            <div className="grid gap-2">
                                <Label htmlFor="fournisseur">
                                    Fournisseur (facultatif)
                                </Label>
                                <Select
                                    value={supplier}
                                    onValueChange={setSupplier}
                                >
                                    <SelectTrigger id="fournisseur">
                                        <SelectValue placeholder="Aucun" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers.map((option) => (
                                            <SelectItem
                                                key={option.id}
                                                value={String(option.id)}
                                            >
                                                {option.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}

                        <div className="grid gap-2">
                            <Label htmlFor="note">Note (facultatif)</Label>
                            <Textarea
                                id="note"
                                rows={2}
                                value={note}
                                onChange={(event) =>
                                    setNote(event.target.value)
                                }
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="submit">Enregistrer</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

AchatsIndex.layout = {
    breadcrumbs: [{ title: 'Achats du jour', href: '/achats' }],
};
