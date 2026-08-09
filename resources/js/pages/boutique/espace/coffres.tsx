import { Head, Link, router } from '@inertiajs/react';
import { ArrowRight, Loader2, PiggyBank, Plus } from 'lucide-react';
import { useState } from 'react';
import { EspaceNav, VaultProgress } from '@/components/boutique/espace-nav';
import InputError from '@/components/input-error';
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
import { dateTime, money, parseAmount } from '@/lib/format';
import type { StatusTone } from '@/types/senvalise';

type Deposit = {
    id: number;
    amount: number;
    method: string;
    note: string | null;
    date: string | null;
};

type VaultRow = {
    id: number;
    reference: string;
    label: string;
    target: number;
    saved: number;
    remaining: number;
    progress: number;
    status: string;
    statusLabel: string;
    statusTone: StatusTone;
    statusDescription: string;
    article: string | null;
    deposits: Deposit[];
};

const AUCUN_ARTICLE = '__aucun__';

export default function EspaceCoffres({
    vaults,
    articles,
}: {
    vaults: VaultRow[];
    articles: Array<{ id: number; label: string; price: number }>;
}) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        label: '',
        target_amount: '',
        product_variant_id: AUCUN_ARTICLE,
        note: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);

    const article = articles.find(
        (candidate) => String(candidate.id) === form.product_variant_id,
    );

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setSending(true);

        router.post(
            '/boutique/espace/coffres',
            {
                label: form.label,
                // Sans montant saisi, l'objectif se déduit du prix de
                // l'article : c'est plus juste que de recopier un tarif qui
                // peut changer.
                target_amount: form.target_amount
                    ? parseAmount(form.target_amount)
                    : null,
                product_variant_id:
                    form.product_variant_id === AUCUN_ARTICLE
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
                        label: '',
                        target_amount: '',
                        product_variant_id: AUCUN_ARTICLE,
                        note: '',
                    });
                },
                onFinish: () => setSending(false),
            },
        );
    }

    return (
        <>
            <Head title="Mes coffres" />

            <div className="mx-auto max-w-4xl px-4 py-8">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Mes coffres
                    </h1>
                    <Button onClick={() => setOpen(true)}>
                        <Plus className="size-4" />
                        Ouvrir un coffre
                    </Button>
                </div>

                <EspaceNav />

                {vaults.length === 0 ? (
                    <div className="anim-entree space-y-4 border border-dashed p-6 text-center">
                        <span className="mx-auto flex size-12 items-center justify-center bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            <PiggyBank className="size-6" />
                        </span>
                        <div className="space-y-1">
                            <p className="font-medium">
                                Achetez à votre rythme
                            </p>
                            <p className="mx-auto max-w-md text-sm text-muted-foreground">
                                Ouvrez un coffre, passez en boutique verser ce
                                que vous pouvez quand vous le pouvez, et
                                commandez le jour où l’objectif est atteint.
                                Sans intérêt, et l’argent vous est rendu si vous
                                changez d’avis.
                            </p>
                        </div>
                        <Button onClick={() => setOpen(true)}>
                            <Plus className="size-4" />
                            Ouvrir mon premier coffre
                        </Button>
                    </div>
                ) : (
                    <ul className="space-y-4">
                        {vaults.map((vault, index) => (
                            <li
                                key={vault.id}
                                style={{ animationDelay: `${index * 50}ms` }}
                                className="anim-entree verre"
                            >
                                <div className="space-y-3 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-medium">
                                                {vault.label}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {vault.reference}
                                                {vault.article
                                                    ? ` · ${vault.article}`
                                                    : ''}
                                            </p>
                                        </div>
                                        <StatusBadge
                                            label={vault.statusLabel}
                                            tone={vault.statusTone}
                                        />
                                    </div>

                                    <VaultProgress progress={vault.progress} />

                                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                                        <p className="text-lg font-semibold tabular-nums">
                                            {money(vault.saved)}
                                            <span className="ml-1 text-sm font-normal text-muted-foreground">
                                                sur {money(vault.target)}
                                            </span>
                                        </p>
                                        {vault.remaining > 0 ? (
                                            <p className="text-sm text-muted-foreground tabular-nums">
                                                Reste {money(vault.remaining)}
                                            </p>
                                        ) : null}
                                    </div>

                                    <p className="text-sm text-muted-foreground">
                                        {vault.statusDescription}
                                    </p>

                                    {vault.status === 'atteint' ? (
                                        <Button asChild size="sm">
                                            <Link href="/boutique/catalogue">
                                                Commander maintenant
                                                <ArrowRight className="size-4" />
                                            </Link>
                                        </Button>
                                    ) : null}
                                </div>

                                {vault.deposits.length > 0 ? (
                                    <details className="border-t">
                                        <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                                            Voir mes versements (
                                            {vault.deposits.length})
                                        </summary>
                                        <ul className="divide-y border-t text-sm">
                                            {vault.deposits.map((deposit) => (
                                                <li
                                                    key={deposit.id}
                                                    className="flex items-center justify-between gap-3 px-4 py-2"
                                                >
                                                    <span className="min-w-0">
                                                        <span className="block text-xs text-muted-foreground">
                                                            {dateTime(
                                                                deposit.date,
                                                            )}{' '}
                                                            · {deposit.method}
                                                        </span>
                                                        {deposit.note ? (
                                                            <span className="block text-xs text-muted-foreground">
                                                                {deposit.note}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                    <span className="shrink-0 font-medium tabular-nums">
                                                        {money(deposit.amount)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                ) : (
                                    <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                                        Aucun versement pour l’instant. Passez
                                        en boutique pour alimenter ce coffre.
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* ------------------------------------------ Ouverture */}
            <Dialog open={open} onOpenChange={setOpen}>
                {/*
                 * Radix pose ses calques dans `body` : hors du sous-arbre de
                 * la vitrine, ils reprendraient les angles arrondis de
                 * l'application de gestion.
                 */}
                <DialogContent className="vitrine-anguleux sm:max-w-lg">
                    <form onSubmit={submit} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>Ouvrir un coffre</DialogTitle>
                            <DialogDescription>
                                Fixez un objectif, ou choisissez l’article que
                                vous visez — nous en reprendrons le prix.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-2">
                            <Label htmlFor="label">Nom du coffre</Label>
                            <Input
                                id="label"
                                value={form.label}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        label: event.target.value,
                                    })
                                }
                                placeholder="Ma valise pour l’été"
                                className="h-11 sm:h-9"
                                required
                            />
                            <InputError message={errors.label} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="article">
                                Article visé (facultatif)
                            </Label>
                            <Select
                                value={form.product_variant_id}
                                onValueChange={(value) =>
                                    setForm({
                                        ...form,
                                        product_variant_id: value,
                                    })
                                }
                            >
                                <SelectTrigger
                                    id="article"
                                    className="h-11 w-full sm:h-9"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="vitrine-anguleux">
                                    <SelectItem value={AUCUN_ARTICLE}>
                                        Je fixe un montant
                                    </SelectItem>
                                    {articles.map((candidate) => (
                                        <SelectItem
                                            key={candidate.id}
                                            value={String(candidate.id)}
                                        >
                                            {candidate.label} —{' '}
                                            {money(candidate.price)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="target">
                                Objectif{article ? ' (facultatif)' : ''}
                            </Label>
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
                                placeholder={
                                    article
                                        ? String(article.price)
                                        : 'Ex. 180000'
                                }
                                className="h-11 sm:h-9"
                            />
                            <InputError message={errors.target_amount} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="note">Note (facultatif)</Label>
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

                        <p className="bg-muted px-3 py-2 text-xs text-muted-foreground">
                            Les versements se font en boutique, en espèces,
                            Wave, Orange Money ou Free Money. Chaque versement
                            est enregistré et visible ici.
                        </p>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                            >
                                Annuler
                            </Button>
                            <Button type="submit" disabled={sending}>
                                {sending ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Ouvrir le coffre
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
