import { Head, Link, router } from '@inertiajs/react';
import { Loader2, PiggyBank, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
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
import { useFilters } from '@/hooks/use-filters';
import { count, money, parseAmount } from '@/lib/format';
import type { Option, Paginated } from '@/types';
import type { StatusTone } from '@/types/senvalise';

type VaultRow = {
    id: number;
    reference: string;
    label: string;
    customer: string | null;
    article: string | null;
    target: number;
    saved: number;
    remaining: number;
    progress: number;
    status: string;
    statusLabel: string;
    statusTone: StatusTone;
    createdAt: string | null;
};

const AUCUN = '__aucun__';

export default function CoffresIndex({
    vaults,
    filters,
    statuses,
    customers,
    articles,
    totals,
}: {
    vaults: Paginated<VaultRow>;
    filters: Record<string, string | undefined>;
    statuses: Option[];
    customers: Array<{ id: number; name: string; phone: string | null }>;
    articles: Array<{ id: number; label: string; price: number }>;
    totals: { held: number; open: number; reached: number };
}) {
    const { values, set, reset, isFiltered } = useFilters('/coffres', {
        recherche: filters.recherche ?? '',
        statut: filters.statut ?? '',
    });

    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        customer_id: '',
        label: '',
        target_amount: '',
        product_variant_id: AUCUN,
        note: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);

        router.post(
            '/coffres',
            {
                customer_id: Number(form.customer_id),
                label: form.label,
                target_amount: parseAmount(form.target_amount),
                product_variant_id:
                    form.product_variant_id === AUCUN
                        ? null
                        : Number(form.product_variant_id),
                note: form.note || null,
            },
            {
                preserveScroll: true,
                onError: setErrors,
                onSuccess: () => {
                    setOpen(false);
                    setForm({
                        customer_id: '',
                        label: '',
                        target_amount: '',
                        product_variant_id: AUCUN,
                        note: '',
                    });
                },
                onFinish: () => setSaving(false),
            },
        );
    }

    return (
        <>
            <Head title="Coffres" />

            <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
                <PageHeader
                    title="Coffres"
                    description="La mise de côté des clients. Les versements se saisissent ici, au comptoir."
                    actions={
                        <Button onClick={() => setOpen(true)}>
                            <Plus className="size-4" />
                            Ouvrir un coffre
                        </Button>
                    }
                />

                <div className="grid grid-cols-3 gap-3">
                    <StatCard
                        label="Argent détenu"
                        value={money(totals.held)}
                        hint="Dû aux clients"
                        icon={Wallet}
                        tone="warning"
                    />
                    <StatCard
                        label="En cours"
                        value={count(totals.open)}
                        icon={PiggyBank}
                    />
                    <StatCard
                        label="Objectif atteint"
                        value={count(totals.reached)}
                        hint="Prêts à commander"
                        icon={PiggyBank}
                        tone="success"
                    />
                </div>

                {/* L'argent des coffres n'est pas une recette : c'est une dette
                    envers le client, remboursable. Le rappeler évite de
                    confondre la caisse avec la trésorerie. */}
                <p className="rounded-lg bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                    Les {money(totals.held)} détenus appartiennent aux clients :
                    ils sont remboursables à tout moment et n’entrent pas dans le
                    chiffre d’affaires.
                </p>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Référence, client, libellé…"
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
                </FilterBar>

                <DataList
                    rows={vaults.data}
                    getKey={(vault) => vault.id}
                    tileHref={(vault) => `/coffres/${vault.id}`}
                    columns={[
                        {
                            key: 'coffre',
                            header: 'Coffre',
                            cell: (vault) => (
                                <>
                                    <Link
                                        href={`/coffres/${vault.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {vault.label}
                                    </Link>
                                    <span className="block text-xs text-muted-foreground">
                                        {vault.reference}
                                    </span>
                                </>
                            ),
                        },
                        {
                            key: 'client',
                            header: 'Client',
                            className: 'text-sm',
                            cell: (vault) => vault.customer ?? '—',
                        },
                        {
                            key: 'article',
                            header: 'Article visé',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (vault) => vault.article ?? '—',
                        },
                        {
                            key: 'avancement',
                            header: 'Avancement',
                            cell: (vault) => (
                                <span className="block w-32">
                                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                        <span
                                            className="anim-barre-h block h-full rounded-full bg-blue-600"
                                            style={{
                                                width: `${Math.max(vault.progress, 2)}%`,
                                            }}
                                        />
                                    </span>
                                    <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                                        {vault.progress} %
                                    </span>
                                </span>
                            ),
                        },
                        {
                            key: 'epargne',
                            header: 'Épargné',
                            align: 'right',
                            className: 'font-medium',
                            cell: (vault) => money(vault.saved),
                        },
                        {
                            key: 'objectif',
                            header: 'Objectif',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (vault) => money(vault.target),
                        },
                        {
                            key: 'statut',
                            header: 'Statut',
                            cell: (vault) => (
                                <StatusBadge
                                    label={vault.statusLabel}
                                    tone={vault.statusTone}
                                />
                            ),
                        },
                    ]}
                    tile={(vault) => (
                        <div className="space-y-2">
                            <TileHeader
                                title={vault.label}
                                subtitle={`${vault.customer ?? '—'} · ${vault.reference}`}
                                trailing={
                                    <StatusBadge
                                        label={vault.statusLabel}
                                        tone={vault.statusTone}
                                    />
                                }
                            />
                            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <span
                                    className="anim-barre-h block h-full rounded-full bg-blue-600"
                                    style={{
                                        width: `${Math.max(vault.progress, 2)}%`,
                                    }}
                                />
                            </span>
                            <p className="flex justify-between text-xs tabular-nums">
                                <span className="font-medium">
                                    {money(vault.saved)}
                                </span>
                                <span className="text-muted-foreground">
                                    sur {money(vault.target)}
                                </span>
                            </p>
                        </div>
                    )}
                    empty={
                        <EmptyState
                            icon={PiggyBank}
                            title="Aucun coffre"
                            description={
                                isFiltered
                                    ? 'Aucun coffre ne correspond à ces filtres.'
                                    : 'Ouvrez un coffre pour un client qui souhaite payer en plusieurs fois.'
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={vaults.links}
                            from={vaults.from}
                            to={vaults.to}
                            total={vaults.total}
                            label="coffres"
                        />
                    }
                />
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <form onSubmit={submit} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>Ouvrir un coffre</DialogTitle>
                            <DialogDescription>
                                Pour un client qui souhaite mettre de côté.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-2">
                            <Label htmlFor="client">Client</Label>
                            <Select
                                value={form.customer_id}
                                onValueChange={(value) =>
                                    setForm({ ...form, customer_id: value })
                                }
                            >
                                <SelectTrigger id="client" className="w-full">
                                    <SelectValue placeholder="Choisir un client" />
                                </SelectTrigger>
                                <SelectContent>
                                    {customers.map((customer) => (
                                        <SelectItem
                                            key={customer.id}
                                            value={String(customer.id)}
                                        >
                                            {customer.name}
                                            {customer.phone
                                                ? ` — ${customer.phone}`
                                                : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.customer_id ? (
                                <p className="text-xs text-destructive">
                                    {errors.customer_id}
                                </p>
                            ) : null}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="label">Libellé</Label>
                            <Input
                                id="label"
                                value={form.label}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        label: event.target.value,
                                    })
                                }
                                placeholder="Valise cabine pour Awa"
                                required
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="article">
                                    Article visé (facultatif)
                                </Label>
                                <Select
                                    value={form.product_variant_id}
                                    onValueChange={(value) => {
                                        const article = articles.find(
                                            (candidate) =>
                                                String(candidate.id) === value,
                                        );

                                        setForm({
                                            ...form,
                                            product_variant_id: value,
                                            // On préremplit l'objectif avec le
                                            // prix : neuf fois sur dix c'est
                                            // celui-là.
                                            target_amount: article
                                                ? String(article.price)
                                                : form.target_amount,
                                        });
                                    }}
                                >
                                    <SelectTrigger id="article" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={AUCUN}>
                                            Aucun
                                        </SelectItem>
                                        {articles.map((article) => (
                                            <SelectItem
                                                key={article.id}
                                                value={String(article.id)}
                                            >
                                                {article.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="target">Objectif (FCFA)</Label>
                                <Input
                                    id="target"
                                    inputMode="numeric"
                                    value={form.target_amount}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            target_amount: event.target.value,
                                        })
                                    }
                                    required
                                />
                                {errors.target_amount ? (
                                    <p className="text-xs text-destructive">
                                        {errors.target_amount}
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="note">Note</Label>
                            <Textarea
                                id="note"
                                rows={2}
                                value={form.note}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        note: event.target.value,
                                    })
                                }
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                Annuler
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Ouvrir
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}

CoffresIndex.layout = {
    breadcrumbs: [{ title: 'Coffres', href: '/coffres' }],
};
