import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { amount, money, parseAmount } from '@/lib/format';
import type { IdOption } from '@/types';

type SaleItemRow = {
    variantId: number | null;
    designation: string;
    quantity: number;
    alreadyReturned: number;
    returnable: number;
    unitPrice: number;
};

type SalePayload = {
    id: number;
    reference: string;
    soldAt: string | null;
    customerId: number | null;
    customer: string | null;
    total: number;
    items: SaleItemRow[];
};

type Line = {
    key: string;
    variantId: number | null;
    designation: string;
    quantity: number;
    unitPrice: number;
    restocked: boolean;
    max: number | null;
};

type ReasonOption = { value: string; label: string; restock: boolean };
type RefundOption = { value: string; label: string; movesMoney: boolean };

export default function RetourForm({
    reasons,
    refundMethods,
    customers,
    prefill,
}: {
    reasons: ReasonOption[];
    refundMethods: RefundOption[];
    customers: IdOption[];
    prefill: SalePayload | null;
}) {
    const [sale, setSale] = useState<SalePayload | null>(prefill);
    const [reference, setReference] = useState(prefill?.reference ?? '');
    const [searching, setSearching] = useState(false);
    const [notFound, setNotFound] = useState(false);

    const [lines, setLines] = useState<Line[]>(() =>
        prefill ? linesFromSale(prefill) : [],
    );
    const [reason, setReason] = useState('non_satisfait');
    const [refundMethod, setRefundMethod] = useState('especes');
    const [customerId, setCustomerId] = useState(
        prefill?.customerId ? String(prefill.customerId) : '',
    );
    const [note, setNote] = useState('');

    const total = useMemo(
        () =>
            lines.reduce(
                (sum, line) => sum + line.unitPrice * line.quantity,
                0,
            ),
        [lines],
    );

    const restockDefault =
        reasons.find((option) => option.value === reason)?.restock ?? true;

    async function lookup() {
        if (reference.trim().length < 3) {
            return;
        }

        setSearching(true);
        setNotFound(false);

        try {
            const response = await fetch(
                `/retours/recherche-vente?reference=${encodeURIComponent(reference.trim())}`,
                { headers: { Accept: 'application/json' } },
            );
            const data = (await response.json()) as {
                sale: SalePayload | null;
            };

            if (!data.sale) {
                setNotFound(true);

                return;
            }

            setSale(data.sale);
            setLines(linesFromSale(data.sale));
            setCustomerId(
                data.sale.customerId ? String(data.sale.customerId) : '',
            );
        } finally {
            setSearching(false);
        }
    }

    function addFreeLine() {
        setLines((current) => [
            ...current,
            {
                key: `libre-${current.length}-${Date.now()}`,
                variantId: null,
                designation: '',
                quantity: 1,
                unitPrice: 0,
                restocked: false,
                max: null,
            },
        ]);
    }

    function update(key: string, patch: Partial<Line>) {
        setLines((current) =>
            current.map((line) =>
                line.key === key ? { ...line, ...patch } : line,
            ),
        );
    }

    function submit(event: React.FormEvent) {
        event.preventDefault();

        router.post('/retours', {
            sale_id: sale?.id ?? null,
            customer_id: customerId === '' ? null : Number(customerId),
            reason,
            refund_method: refundMethod,
            note,
            lines: lines
                .filter((line) => line.quantity > 0)
                .map((line) => ({
                    product_variant_id: line.variantId,
                    designation: line.designation,
                    quantity: line.quantity,
                    unit_price: line.unitPrice,
                    restocked: line.restocked,
                })),
        });
    }

    return (
        <>
            <Head title="Nouveau retour" />

            <form onSubmit={submit} className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Nouveau retour client"
                    description="Repartez du ticket d'origine quand le client l'a : les prix pratiqués ce jour-là sont repris tels quels."
                    actions={
                        <>
                            <Button variant="outline" asChild>
                                <Link href="/retours">
                                    <ArrowLeft className="size-4" />
                                    Annuler
                                </Link>
                            </Button>
                            <Button type="submit" disabled={lines.length === 0}>
                                Enregistrer le retour
                            </Button>
                        </>
                    }
                />

                <div className="rounded-xl border bg-card p-4 shadow-sm">
                    <Label htmlFor="ticket">Ticket d'origine</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Input
                            id="ticket"
                            placeholder="V-2026-000123"
                            className="w-full sm:w-64"
                            value={reference}
                            onChange={(event) =>
                                setReference(event.target.value)
                            }
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void lookup();
                                }
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void lookup()}
                            disabled={searching}
                        >
                            <Search className="size-4" />
                            {searching ? 'Recherche…' : 'Retrouver la vente'}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={addFreeLine}
                        >
                            <Plus className="size-4" />
                            Retour sans ticket
                        </Button>
                    </div>

                    {notFound ? (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                            Aucune vente ne porte ce numéro. Vous pouvez quand
                            même enregistrer un retour sans ticket.
                        </p>
                    ) : null}

                    {sale ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                            Vente {sale.reference} ·{' '}
                            {sale.customer ?? 'client de passage'} ·{' '}
                            {money(sale.total)}
                        </p>
                    ) : null}
                </div>

                <div className="rounded-xl border bg-card shadow-sm">
                    <div className="border-b p-4">
                        <h2 className="font-medium">Articles rendus</h2>
                        <p className="text-sm text-muted-foreground">
                            Décochez la remise en stock pour ce qui revient
                            cassé : l'article est remboursé sans repartir en
                            rayon.
                        </p>
                    </div>

                    {lines.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground">
                            Retrouvez la vente ci-dessus, ou ajoutez une ligne
                            libre pour un retour sans ticket.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {lines.map((line) => (
                                <li
                                    key={line.key}
                                    className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end"
                                >
                                    <div className="grid gap-2">
                                        <Label
                                            htmlFor={`designation-${line.key}`}
                                        >
                                            Article
                                        </Label>
                                        <Input
                                            id={`designation-${line.key}`}
                                            value={line.designation}
                                            placeholder="Désignation"
                                            readOnly={line.variantId !== null}
                                            onChange={(event) =>
                                                update(line.key, {
                                                    designation:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                        {line.max !== null ? (
                                            <span className="text-xs text-muted-foreground">
                                                {line.max} rendable
                                                {line.max > 1 ? 's' : ''} sur ce
                                                ticket
                                            </span>
                                        ) : null}
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor={`qte-${line.key}`}>
                                            Quantité
                                        </Label>
                                        <Input
                                            id={`qte-${line.key}`}
                                            type="number"
                                            min={0}
                                            max={line.max ?? undefined}
                                            className="w-24"
                                            value={line.quantity}
                                            onChange={(event) =>
                                                update(line.key, {
                                                    quantity: Math.max(
                                                        0,
                                                        Number(
                                                            event.target.value,
                                                        ) || 0,
                                                    ),
                                                })
                                            }
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor={`prix-${line.key}`}>
                                            Prix unitaire
                                        </Label>
                                        <Input
                                            id={`prix-${line.key}`}
                                            inputMode="numeric"
                                            className="w-32"
                                            value={String(line.unitPrice)}
                                            onChange={(event) =>
                                                update(line.key, {
                                                    unitPrice: parseAmount(
                                                        event.target.value,
                                                    ),
                                                })
                                            }
                                        />
                                    </div>

                                    <label className="flex items-center gap-2 pb-2 text-sm">
                                        <Checkbox
                                            checked={line.restocked}
                                            onCheckedChange={(checked) =>
                                                update(line.key, {
                                                    restocked: checked === true,
                                                })
                                            }
                                        />
                                        Remettre en stock
                                    </label>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Retirer la ligne"
                                        onClick={() =>
                                            setLines((current) =>
                                                current.filter(
                                                    (item) =>
                                                        item.key !== line.key,
                                                ),
                                            )
                                        }
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                    <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="motif">Motif</Label>
                            <Select
                                value={reason}
                                onValueChange={(value) => {
                                    setReason(value);
                                    // Le motif porte une intention : un défaut
                                    // ne repart pas en rayon. On applique la
                                    // valeur par défaut du motif aux lignes
                                    // issues du ticket, l'utilisateur restant
                                    // libre de la corriger ligne à ligne.
                                    const next =
                                        reasons.find(
                                            (option) => option.value === value,
                                        )?.restock ?? true;
                                    setLines((current) =>
                                        current.map((line) =>
                                            line.variantId === null
                                                ? line
                                                : { ...line, restocked: next },
                                        ),
                                    );
                                }}
                            >
                                <SelectTrigger id="motif">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {reasons.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!restockDefault ? (
                                <p className="text-xs text-muted-foreground">
                                    Les articles défectueux ne sont pas remis en
                                    stock par défaut.
                                </p>
                            ) : null}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="dedommagement">Dédommagement</Label>
                            <Select
                                value={refundMethod}
                                onValueChange={setRefundMethod}
                            >
                                <SelectTrigger id="dedommagement">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {refundMethods.map((option) => (
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
                            <Label htmlFor="client">Client</Label>
                            <Select
                                value={customerId}
                                onValueChange={setCustomerId}
                            >
                                <SelectTrigger id="client">
                                    <SelectValue placeholder="Client de passage" />
                                </SelectTrigger>
                                <SelectContent>
                                    {customers.map((option) => (
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

                        <div className="grid gap-2 sm:col-span-2">
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

                    <div className="rounded-xl border bg-card p-4 shadow-sm">
                        <h2 className="font-medium">Récapitulatif</h2>
                        <dl className="mt-3 space-y-2 text-sm">
                            <div className="flex justify-between gap-3">
                                <dt className="text-muted-foreground">
                                    Articles
                                </dt>
                                <dd className="tabular-nums">
                                    {lines.reduce(
                                        (sum, line) => sum + line.quantity,
                                        0,
                                    )}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-muted-foreground">
                                    Remis en stock
                                </dt>
                                <dd className="tabular-nums">
                                    {lines
                                        .filter((line) => line.restocked)
                                        .reduce(
                                            (sum, line) => sum + line.quantity,
                                            0,
                                        )}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-3 border-t pt-2 text-base font-medium">
                                <dt>À rendre</dt>
                                <dd className="tabular-nums">
                                    {amount(total)}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </form>
        </>
    );
}

/** Une ligne par article encore rendable ; le reste n'a rien à faire à l'écran. */
function linesFromSale(sale: SalePayload): Line[] {
    return sale.items
        .filter((item) => item.returnable > 0)
        .map((item, index) => ({
            key: `vente-${item.variantId ?? index}`,
            variantId: item.variantId,
            designation: item.designation,
            quantity: item.returnable,
            unitPrice: item.unitPrice,
            restocked: true,
            max: item.returnable,
        }));
}

RetourForm.layout = {
    breadcrumbs: [
        { title: 'Retours', href: '/retours' },
        { title: 'Nouveau', href: '/retours/nouveau' },
    ],
};
