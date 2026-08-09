import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, Loader2, PackagePlus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import InputError from '@/components/input-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { VariantPicker } from '@/components/variant-picker';
import { amount, count, money, parseAmount, todayInput } from '@/lib/format';
import type { IdOption, VariantOption } from '@/types';

type Line = {
    product_variant_id: number;
    label: string;
    sku: string;
    quantity: number;
    unit_cost: string;
};

type ArrivalForm = {
    id?: number;
    reference?: string;
    supplier_id?: number | null;
    arrival_date?: string;
    currency?: string;
    exchange_rate?: number;
    shipping_cost?: number;
    customs_cost?: number;
    other_cost?: number;
    notes?: string;
    lines?: Array<{
        product_variant_id: number;
        label: string;
        sku: string;
        quantity: number;
        unit_cost: number;
    }>;
};

const NO_SUPPLIER = '__aucun__';
const CURRENCIES = ['XOF', 'EUR', 'USD', 'CNY', 'AED', 'TRY', 'MAD'];

export default function ArrivageForm({
    arrival,
    reference,
    suppliers,
    variants,
}: {
    arrival: ArrivalForm | null;
    reference: string;
    suppliers: IdOption[];
    variants: VariantOption[];
}) {
    const isEdit = Boolean(arrival?.id);

    const [form, setForm] = useState({
        supplier_id: arrival?.supplier_id
            ? String(arrival.supplier_id)
            : NO_SUPPLIER,
        arrival_date: arrival?.arrival_date ?? todayInput(),
        currency: arrival?.currency ?? 'XOF',
        exchange_rate: String(arrival?.exchange_rate ?? 1),
        shipping_cost: String(arrival?.shipping_cost ?? ''),
        customs_cost: String(arrival?.customs_cost ?? ''),
        other_cost: String(arrival?.other_cost ?? ''),
        notes: arrival?.notes ?? '',
    });

    const [lines, setLines] = useState<Line[]>(
        (arrival?.lines ?? []).map((line) => ({
            product_variant_id: line.product_variant_id,
            label: line.label,
            sku: line.sku,
            quantity: line.quantity,
            unit_cost: String(line.unit_cost),
        })),
    );

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);

    const rate = Number(form.exchange_rate) || 1;
    const extraCosts =
        parseAmount(form.shipping_cost) +
        parseAmount(form.customs_cost) +
        parseAmount(form.other_cost);

    // Aperçu en direct : c'est ce calcul qui donne le vrai prix de revient.
    const preview = useMemo(() => {
        const rows = lines.map((line) => {
            const unitCostXof = Math.round(
                (Number(line.unit_cost) || 0) * rate,
            );

            return {
                ...line,
                unitCostXof,
                lineTotal: unitCostXof * line.quantity,
            };
        });

        const goodsCost = rows.reduce((sum, row) => sum + row.lineTotal, 0);
        const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);

        const withLanded = rows.map((row) => {
            const share =
                extraCosts <= 0
                    ? 0
                    : goodsCost > 0
                      ? Math.round(extraCosts * (row.lineTotal / goodsCost))
                      : totalQuantity > 0
                        ? Math.round(
                              extraCosts * (row.quantity / totalQuantity),
                          )
                        : 0;

            return {
                ...row,
                landedUnitCost:
                    row.unitCostXof +
                    (row.quantity > 0 ? Math.round(share / row.quantity) : 0),
            };
        });

        return {
            rows: withLanded,
            goodsCost,
            totalQuantity,
            totalCost: goodsCost + extraCosts,
        };
    }, [lines, rate, extraCosts]);

    function addVariant(variant: VariantOption) {
        setLines((current) => {
            if (current.some((l) => l.product_variant_id === variant.id)) {
                return current;
            }

            return [
                ...current,
                {
                    product_variant_id: variant.id,
                    label: variant.label,
                    sku: variant.sku,
                    quantity: 1,
                    unit_cost: String(
                        form.currency === 'XOF' ? (variant.costPrice ?? 0) : '',
                    ),
                },
            ];
        });
    }

    function updateLine(index: number, patch: Partial<Line>) {
        setLines((current) =>
            current.map((line, i) =>
                i === index ? { ...line, ...patch } : line,
            ),
        );
    }

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setProcessing(true);

        const payload = {
            supplier_id:
                form.supplier_id === NO_SUPPLIER
                    ? null
                    : Number(form.supplier_id),
            arrival_date: form.arrival_date,
            currency: form.currency,
            exchange_rate: rate,
            shipping_cost: parseAmount(form.shipping_cost),
            customs_cost: parseAmount(form.customs_cost),
            other_cost: parseAmount(form.other_cost),
            notes: form.notes || null,
            lines: lines.map((line) => ({
                product_variant_id: line.product_variant_id,
                quantity: line.quantity,
                unit_cost: Number(line.unit_cost) || 0,
            })),
        };

        const options = {
            onError: (received: Record<string, string>) => setErrors(received),
            onFinish: () => setProcessing(false),
        };

        if (isEdit) {
            router.put(`/arrivages/${arrival?.id}`, payload, options);
        } else {
            router.post('/arrivages', payload, options);
        }
    }

    return (
        <>
            <Head
                title={isEdit ? `Modifier ${reference}` : 'Nouvel arrivage'}
            />

            <form onSubmit={submit} className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={isEdit ? 'Modifier l’arrivage' : 'Nouvel arrivage'}
                    description={
                        <span className="font-mono text-xs">{reference}</span>
                    }
                    actions={
                        <>
                            <Button asChild variant="outline" type="button">
                                <Link
                                    href={
                                        isEdit
                                            ? `/arrivages/${arrival?.id}`
                                            : '/arrivages'
                                    }
                                >
                                    <ArrowLeft className="size-4" />
                                    Annuler
                                </Link>
                            </Button>
                            <Button
                                type="submit"
                                disabled={processing || lines.length === 0}
                            >
                                {processing ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Enregistrer en brouillon
                            </Button>
                        </>
                    }
                />

                <div className="grid gap-4 xl:grid-cols-3">
                    <Card className="xl:col-span-2">
                        <CardHeader>
                            <CardTitle>Informations</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="supplier">Fournisseur</Label>
                                <Select
                                    value={form.supplier_id}
                                    onValueChange={(value) =>
                                        setForm({ ...form, supplier_id: value })
                                    }
                                >
                                    <SelectTrigger
                                        id="supplier"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_SUPPLIER}>
                                            Non précisé
                                        </SelectItem>
                                        {suppliers.map((supplier) => (
                                            <SelectItem
                                                key={supplier.id}
                                                value={String(supplier.id)}
                                            >
                                                {supplier.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="arrival_date">
                                    Date d'arrivage
                                </Label>
                                <Input
                                    id="arrival_date"
                                    type="date"
                                    value={form.arrival_date}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            arrival_date: event.target.value,
                                        })
                                    }
                                    required
                                />
                                <InputError message={errors.arrival_date} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="currency">Devise d'achat</Label>
                                <Select
                                    value={form.currency}
                                    onValueChange={(value) =>
                                        setForm({
                                            ...form,
                                            currency: value,
                                            exchange_rate:
                                                value === 'XOF'
                                                    ? '1'
                                                    : form.exchange_rate,
                                        })
                                    }
                                >
                                    <SelectTrigger
                                        id="currency"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CURRENCIES.map((currency) => (
                                            <SelectItem
                                                key={currency}
                                                value={currency}
                                            >
                                                {currency}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="rate">
                                    Taux de change (1 {form.currency} = ? FCFA)
                                </Label>
                                <Input
                                    id="rate"
                                    value={form.exchange_rate}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            exchange_rate: event.target.value,
                                        })
                                    }
                                    inputMode="decimal"
                                    disabled={form.currency === 'XOF'}
                                    className="tabular-nums"
                                />
                                <InputError message={errors.exchange_rate} />
                            </div>

                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea
                                    id="notes"
                                    value={form.notes}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            notes: event.target.value,
                                        })
                                    }
                                    placeholder="Numéro de conteneur, transitaire, observations…"
                                    rows={2}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Frais annexes</CardTitle>
                            <CardDescription>
                                Répartis sur les articles au prorata de leur
                                valeur.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            <div className="grid gap-2">
                                <Label htmlFor="shipping">
                                    Transport / fret
                                </Label>
                                <Input
                                    id="shipping"
                                    value={form.shipping_cost}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            shipping_cost: event.target.value,
                                        })
                                    }
                                    placeholder="0"
                                    inputMode="numeric"
                                    className="text-right tabular-nums"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="customs">Douane</Label>
                                <Input
                                    id="customs"
                                    value={form.customs_cost}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            customs_cost: event.target.value,
                                        })
                                    }
                                    placeholder="0"
                                    inputMode="numeric"
                                    className="text-right tabular-nums"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="other">
                                    Manutention, divers
                                </Label>
                                <Input
                                    id="other"
                                    value={form.other_cost}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            other_cost: event.target.value,
                                        })
                                    }
                                    placeholder="0"
                                    inputMode="numeric"
                                    className="text-right tabular-nums"
                                />
                            </div>

                            <div className="mt-1 space-y-1 border-t pt-3 text-sm">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Marchandise</span>
                                    <span className="tabular-nums">
                                        {money(preview.goodsCost)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Frais annexes</span>
                                    <span className="tabular-nums">
                                        {money(extraCosts)}
                                    </span>
                                </div>
                                <div className="flex justify-between font-semibold">
                                    <span>Coût total</span>
                                    <span className="tabular-nums">
                                        {money(preview.totalCost)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Articles</span>
                                    <span className="tabular-nums">
                                        {count(preview.totalQuantity)}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Articles reçus</CardTitle>
                        <CardDescription>
                            Saisissez le prix d'achat en {form.currency}. La
                            colonne « Revient réel » ajoute la part de frais
                            correspondante.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <VariantPicker
                            variants={variants}
                            onSelect={addVariant}
                            excludeIds={lines.map((l) => l.product_variant_id)}
                            className="max-w-xl"
                        />

                        <InputError message={errors.lines} />

                        {lines.length === 0 ? (
                            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                                Aucun article. Recherchez ou scannez un article
                                ci-dessus pour l'ajouter.
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Article</TableHead>
                                        <TableHead className="w-28 text-right">
                                            Quantité
                                        </TableHead>
                                        <TableHead className="w-36 text-right">
                                            Prix ({form.currency})
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Prix en FCFA
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Revient réel
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Total ligne
                                        </TableHead>
                                        <TableHead className="w-10" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {preview.rows.map((row, index) => (
                                        <TableRow key={row.product_variant_id}>
                                            <TableCell>
                                                <span className="font-medium">
                                                    {row.label}
                                                </span>
                                                <span className="block font-mono text-xs text-muted-foreground">
                                                    {row.sku}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={String(row.quantity)}
                                                    onChange={(event) =>
                                                        updateLine(index, {
                                                            quantity:
                                                                Number(
                                                                    event.target.value.replace(
                                                                        /\D/g,
                                                                        '',
                                                                    ),
                                                                ) || 0,
                                                        })
                                                    }
                                                    inputMode="numeric"
                                                    className="h-8 text-right tabular-nums"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={row.unit_cost}
                                                    onChange={(event) =>
                                                        updateLine(index, {
                                                            unit_cost:
                                                                event.target
                                                                    .value,
                                                        })
                                                    }
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    className="h-8 text-right tabular-nums"
                                                />
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                                                {amount(row.unitCostXof)}
                                            </TableCell>
                                            <TableCell className="text-right text-sm font-medium tabular-nums">
                                                {amount(row.landedUnitCost)}
                                            </TableCell>
                                            <TableCell className="text-right text-sm tabular-nums">
                                                {money(row.lineTotal)}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        setLines((current) =>
                                                            current.filter(
                                                                (_, i) =>
                                                                    i !== index,
                                                            ),
                                                        )
                                                    }
                                                    className="text-muted-foreground hover:text-destructive"
                                                    aria-label="Retirer la ligne"
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {lines.length > 0 ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <PackagePlus className="size-3.5" />
                        L'arrivage est d'abord enregistré en brouillon. Le stock
                        ne bouge qu'au moment de la réception, depuis sa fiche.
                    </p>
                ) : null}
            </form>
        </>
    );
}

ArrivageForm.layout = {
    breadcrumbs: [
        { title: 'Arrivages', href: '/arrivages' },
        { title: 'Formulaire', href: '#' },
    ],
};
