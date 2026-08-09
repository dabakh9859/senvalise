import { Head, Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Loader2, Plus, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
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
import { dateTime, money, parseAmount } from '@/lib/format';
import type { Option, SharedProps } from '@/types';
import type { StatusTone } from '@/types/senvalise';

type Vault = {
    id: number;
    reference: string;
    label: string;
    customer: string | null;
    customerPhone: string | null;
    customerId: number | null;
    article: string | null;
    target: number;
    saved: number;
    remaining: number;
    progress: number;
    status: string;
    statusLabel: string;
    statusTone: StatusTone;
    note: string | null;
    reachedAt: string | null;
    closedAt: string | null;
    deposits: Array<{
        id: number;
        amount: number;
        method: string;
        reference: string | null;
        note: string | null;
        user: string | null;
        date: string | null;
    }>;
    orders: Array<{
        id: number;
        reference: string;
        total: number;
        statusLabel: string;
    }>;
};

export default function CoffreShow({
    vault,
    paymentMethods,
}: {
    vault: Vault;
    paymentMethods: Option[];
}) {
    const { auth } = usePage<SharedProps>().props;
    const [open, setOpen] = useState(false);
    const [refunding, setRefunding] = useState(false);
    const [form, setForm] = useState({
        amount: '',
        payment_method: paymentMethods[0]?.value ?? 'especes',
        reference: '',
        note: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const ferme = vault.status === 'utilise' || vault.status === 'annule';

    function deposit(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);

        router.post(
            `/coffres/${vault.id}/versement`,
            { ...form, amount: parseAmount(form.amount) },
            {
                preserveScroll: true,
                onError: setErrors,
                onSuccess: () => {
                    setOpen(false);
                    setForm({ ...form, amount: '', reference: '', note: '' });
                },
                onFinish: () => setSaving(false),
            },
        );
    }

    return (
        <>
            <Head title={`Coffre ${vault.reference}`} />

            <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
                <Link
                    href="/coffres"
                    className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                    Tous les coffres
                </Link>

                <PageHeader
                    title={vault.label}
                    description={`${vault.reference} · ${vault.customer ?? 'client supprimé'}`}
                    actions={
                        <>
                            {!ferme ? (
                                <Button onClick={() => setOpen(true)}>
                                    <Plus className="size-4" />
                                    Enregistrer un versement
                                </Button>
                            ) : null}
                            {auth.isGerant && !ferme ? (
                                <Button
                                    variant="outline"
                                    onClick={() => setRefunding(true)}
                                    className="text-destructive"
                                >
                                    <Undo2 className="size-4" />
                                    Rembourser
                                </Button>
                            ) : null}
                        </>
                    }
                />

                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                    {/* ------------------------------------ Avancement */}
                    <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <StatusBadge
                                label={vault.statusLabel}
                                tone={vault.statusTone}
                            />
                            <span className="text-sm text-muted-foreground tabular-nums">
                                {vault.progress} %
                            </span>
                        </div>

                        <span className="block h-3 w-full overflow-hidden rounded-full bg-muted">
                            <span
                                className="anim-barre-h block h-full rounded-full bg-blue-600 transition-[width] duration-500 ease-out"
                                style={{
                                    width: `${Math.max(vault.progress, 2)}%`,
                                }}
                            />
                        </span>

                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                            <p className="text-2xl font-semibold tabular-nums">
                                {money(vault.saved)}
                                <span className="ml-2 text-base font-normal text-muted-foreground">
                                    sur {money(vault.target)}
                                </span>
                            </p>
                            {vault.remaining > 0 ? (
                                <p className="text-sm text-muted-foreground tabular-nums">
                                    Reste {money(vault.remaining)}
                                </p>
                            ) : null}
                        </div>

                        {/* -------------------------------- Versements */}
                        <div className="space-y-2 border-t pt-4">
                            <h2 className="text-sm font-medium">
                                Versements ({vault.deposits.length})
                            </h2>

                            {vault.deposits.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Aucun versement enregistré.
                                </p>
                            ) : (
                                <ul className="divide-y rounded-lg border">
                                    {vault.deposits.map((deposit) => (
                                        <li
                                            key={deposit.id}
                                            className="anim-entree flex items-start justify-between gap-3 px-3 py-2.5"
                                        >
                                            <span className="min-w-0 text-sm">
                                                <span className="block">
                                                    {dateTime(deposit.date)}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {deposit.method}
                                                    {deposit.reference
                                                        ? ` · ${deposit.reference}`
                                                        : ''}
                                                    {deposit.user
                                                        ? ` · saisi par ${deposit.user}`
                                                        : ''}
                                                </span>
                                                {deposit.note ? (
                                                    <span className="block text-xs text-muted-foreground">
                                                        {deposit.note}
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span
                                                className={`shrink-0 font-medium tabular-nums ${
                                                    deposit.amount < 0
                                                        ? 'text-red-600 dark:text-red-400'
                                                        : ''
                                                }`}
                                            >
                                                {money(deposit.amount)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </section>

                    <aside className="h-fit space-y-4">
                        <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
                            <h2 className="font-medium">Client</h2>
                            <p>{vault.customer ?? '—'}</p>
                            {vault.customerPhone ? (
                                <a
                                    href={`tel:${vault.customerPhone.replace(/\s/g, '')}`}
                                    className="block text-muted-foreground underline underline-offset-4"
                                >
                                    {vault.customerPhone}
                                </a>
                            ) : null}
                            {vault.article ? (
                                <p className="text-muted-foreground">
                                    Article visé : {vault.article}
                                </p>
                            ) : null}
                            {vault.note ? (
                                <p className="rounded-md bg-muted px-2 py-1.5 text-xs">
                                    {vault.note}
                                </p>
                            ) : null}
                        </section>

                        {vault.orders.length > 0 ? (
                            <section className="rounded-xl border bg-card p-4 text-sm">
                                <h2 className="mb-2 font-medium">
                                    Commandes réglées
                                </h2>
                                <ul className="space-y-1.5">
                                    {vault.orders.map((order) => (
                                        <li key={order.id}>
                                            <Link
                                                href={`/commandes/${order.id}`}
                                                className="flex justify-between gap-3 underline underline-offset-4"
                                            >
                                                <span>{order.reference}</span>
                                                <span className="tabular-nums">
                                                    {money(order.total)}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}
                    </aside>
                </div>
            </div>

            {/* ------------------------------------ Versement */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <form onSubmit={deposit} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>Enregistrer un versement</DialogTitle>
                            <DialogDescription>
                                Ce que le client vient de remettre au comptoir.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="amount">Montant (FCFA)</Label>
                                <Input
                                    id="amount"
                                    autoFocus
                                    inputMode="numeric"
                                    value={form.amount}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            amount: event.target.value,
                                        })
                                    }
                                    className="h-11 text-base"
                                    required
                                />
                                {errors.amount ? (
                                    <p className="text-xs text-destructive">
                                        {errors.amount}
                                    </p>
                                ) : null}
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="method">Moyen</Label>
                                <Select
                                    value={form.payment_method}
                                    onValueChange={(value) =>
                                        setForm({
                                            ...form,
                                            payment_method: value,
                                        })
                                    }
                                >
                                    <SelectTrigger id="method" className="h-11 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {paymentMethods.map((method) => (
                                            <SelectItem
                                                key={method.value}
                                                value={method.value}
                                            >
                                                {method.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="reference">
                                Référence de transaction (facultatif)
                            </Label>
                            <Input
                                id="reference"
                                value={form.reference}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        reference: event.target.value,
                                    })
                                }
                                placeholder="Numéro Wave / Orange Money"
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
                                Enregistrer
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ------------------------------------ Remboursement */}
            <Dialog open={refunding} onOpenChange={setRefunding}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rembourser le coffre</DialogTitle>
                        <DialogDescription>
                            {money(vault.saved)} seront rendus au client et le
                            coffre sera fermé. Le remboursement apparaîtra dans
                            l’historique comme un versement négatif — rien n’est
                            effacé.
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRefunding(false)}
                        >
                            Retour
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                router.post(
                                    `/coffres/${vault.id}/rembourser`,
                                    {},
                                    {
                                        preserveScroll: true,
                                        onFinish: () => setRefunding(false),
                                    },
                                )
                            }
                        >
                            Rembourser {money(vault.saved)}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

CoffreShow.layout = {
    breadcrumbs: [
        { title: 'Coffres', href: '/coffres' },
        { title: 'Détail', href: '#' },
    ],
};
