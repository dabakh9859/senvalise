import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
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
import { money, parseAmount, todayInput } from '@/lib/format';
import type { Option, VariantOption } from '@/types';

type Line = {
    product_variant_id: number | null;
    designation: string;
    description: string;
    quantity: number;
    unit_price: string;
    discount: string;
};

type CustomerOption = {
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
};

type DocumentForm = {
    id?: number;
    type: string;
    reference?: string;
    customer_id?: number | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_address?: string | null;
    issue_date?: string;
    valid_until?: string | null;
    due_date?: string | null;
    delivery_date?: string | null;
    discount?: number;
    tax_rate?: number;
    amount_paid?: number;
    notes?: string | null;
    terms?: string | null;
    lines?: Array<{
        product_variant_id: number | null;
        designation: string;
        description: string | null;
        quantity: number;
        unit_price: number;
        discount: number;
    }>;
};

const NO_CUSTOMER = '__aucun__';

export default function DocumentForm({
    document,
    defaultType,
    types,
    customers,
    variants,
    defaults,
}: {
    document: DocumentForm | null;
    defaultType: string;
    types: Option[];
    customers: CustomerOption[];
    variants: VariantOption[];
    defaults: {
        taxRate: number;
        taxLabel: string;
        terms: string | null;
        quoteValidityDays: number;
    };
}) {
    const isEdit = Boolean(document?.id);
    const type = document?.type ?? defaultType;

    const [form, setForm] = useState({
        type,
        customer_id: document?.customer_id
            ? String(document.customer_id)
            : NO_CUSTOMER,
        customer_name: document?.customer_name ?? '',
        customer_phone: document?.customer_phone ?? '',
        customer_address: document?.customer_address ?? '',
        issue_date: document?.issue_date ?? todayInput(),
        valid_until: document?.valid_until ?? '',
        due_date: document?.due_date ?? '',
        delivery_date: document?.delivery_date ?? '',
        discount: String(document?.discount ?? ''),
        tax_rate: String(document?.tax_rate ?? defaults.taxRate),
        amount_paid: String(document?.amount_paid ?? ''),
        notes: document?.notes ?? '',
        terms: document?.terms ?? defaults.terms ?? '',
    });

    const [lines, setLines] = useState<Line[]>(
        (document?.lines ?? []).map((line) => ({
            product_variant_id: line.product_variant_id,
            designation: line.designation,
            description: line.description ?? '',
            quantity: line.quantity,
            unit_price: String(line.unit_price),
            discount: String(line.discount || ''),
        })),
    );

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);

    const totals = useMemo(() => {
        const subtotal = lines.reduce(
            (sum, line) =>
                sum +
                Math.max(
                    0,
                    parseAmount(line.unit_price) * line.quantity -
                        parseAmount(line.discount),
                ),
            0,
        );
        const globalDiscount = Math.min(parseAmount(form.discount), subtotal);
        const taxable = subtotal - globalDiscount;
        const taxAmount = Math.round(
            (taxable * (Number(form.tax_rate) || 0)) / 100,
        );

        return {
            subtotal,
            globalDiscount,
            taxAmount,
            total: taxable + taxAmount,
        };
    }, [lines, form.discount, form.tax_rate]);

    function addVariant(variant: VariantOption) {
        setLines((current) => [
            ...current,
            {
                product_variant_id: variant.id,
                designation: variant.label,
                description: '',
                quantity: 1,
                unit_price: String(variant.price ?? variant.sellingPrice ?? 0),
                discount: '',
            },
        ]);
    }

    function addFreeLine() {
        setLines((current) => [
            ...current,
            {
                product_variant_id: null,
                designation: '',
                description: '',
                quantity: 1,
                unit_price: '',
                discount: '',
            },
        ]);
    }

    function updateLine(index: number, patch: Partial<Line>) {
        setLines((current) =>
            current.map((line, i) =>
                i === index ? { ...line, ...patch } : line,
            ),
        );
    }

    function pickCustomer(value: string) {
        if (value === NO_CUSTOMER) {
            setForm({ ...form, customer_id: value });

            return;
        }

        const customer = customers.find((c) => String(c.id) === value);

        setForm({
            ...form,
            customer_id: value,
            customer_name: customer?.name ?? form.customer_name,
            customer_phone: customer?.phone ?? '',
            customer_address: customer?.address ?? '',
        });
    }

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setProcessing(true);

        const payload = {
            type: form.type,
            customer_id:
                form.customer_id === NO_CUSTOMER
                    ? null
                    : Number(form.customer_id),
            customer_name: form.customer_name || null,
            customer_phone: form.customer_phone || null,
            customer_address: form.customer_address || null,
            issue_date: form.issue_date,
            valid_until: form.valid_until || null,
            due_date: form.due_date || null,
            delivery_date: form.delivery_date || null,
            discount: parseAmount(form.discount),
            tax_rate: Number(form.tax_rate) || 0,
            amount_paid: parseAmount(form.amount_paid),
            notes: form.notes || null,
            terms: form.terms || null,
            lines: lines.map((line) => ({
                product_variant_id: line.product_variant_id,
                designation: line.designation || 'Article',
                description: line.description || null,
                quantity: line.quantity,
                unit_price: parseAmount(line.unit_price),
                discount: parseAmount(line.discount),
            })),
        };

        const options = {
            onError: (received: Record<string, string>) => setErrors(received),
            onFinish: () => setProcessing(false),
        };

        if (isEdit) {
            router.put(`/documents/${document?.id}`, payload, options);
        } else {
            router.post('/documents', payload, options);
        }
    }

    const typeLabel =
        types.find((t) => t.value === form.type)?.label ?? 'Document';

    return (
        <>
            <Head
                title={
                    isEdit
                        ? `Modifier ${document?.reference}`
                        : `Nouveau ${typeLabel.toLowerCase()}`
                }
            />

            <form onSubmit={submit} className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={
                        isEdit
                            ? `Modifier ${document?.reference}`
                            : `Nouveau ${typeLabel.toLowerCase()}`
                    }
                    description="Un document commercial ne touche pas au stock : seule la caisse fait bouger les quantités."
                    actions={
                        <>
                            <Button asChild variant="outline" type="button">
                                <Link
                                    href={
                                        isEdit
                                            ? `/documents/${document?.id}`
                                            : '/documents'
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
                                Enregistrer
                            </Button>
                        </>
                    }
                />

                <div className="grid gap-4 xl:grid-cols-3">
                    <Card className="xl:col-span-2">
                        <CardHeader>
                            <CardTitle>Client et dates</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            {!isEdit ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="type">
                                        Type de document
                                    </Label>
                                    <Select
                                        value={form.type}
                                        onValueChange={(value) =>
                                            setForm({ ...form, type: value })
                                        }
                                    >
                                        <SelectTrigger
                                            id="type"
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {types.map((option) => (
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
                            ) : null}

                            <div className="grid gap-2">
                                <Label htmlFor="customer">Client</Label>
                                <Select
                                    value={form.customer_id}
                                    onValueChange={pickCustomer}
                                >
                                    <SelectTrigger
                                        id="customer"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_CUSTOMER}>
                                            Saisie libre
                                        </SelectItem>
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
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="customer_name">
                                    Nom affiché sur le document
                                </Label>
                                <Input
                                    id="customer_name"
                                    value={form.customer_name}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            customer_name: event.target.value,
                                        })
                                    }
                                    placeholder="Nom du client"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="customer_phone">
                                    Téléphone
                                </Label>
                                <Input
                                    id="customer_phone"
                                    value={form.customer_phone}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            customer_phone: event.target.value,
                                        })
                                    }
                                    placeholder="77 000 00 00"
                                />
                            </div>

                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="customer_address">
                                    Adresse
                                </Label>
                                <Input
                                    id="customer_address"
                                    value={form.customer_address}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            customer_address:
                                                event.target.value,
                                        })
                                    }
                                    placeholder="Quartier, ville"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="issue_date">
                                    Date d'émission
                                </Label>
                                <Input
                                    id="issue_date"
                                    type="date"
                                    value={form.issue_date}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            issue_date: event.target.value,
                                        })
                                    }
                                    required
                                />
                                <InputError message={errors.issue_date} />
                            </div>

                            {form.type === 'devis' ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="valid_until">
                                        Valable jusqu'au
                                    </Label>
                                    <Input
                                        id="valid_until"
                                        type="date"
                                        value={form.valid_until}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                valid_until: event.target.value,
                                            })
                                        }
                                        placeholder={`+${defaults.quoteValidityDays} jours par défaut`}
                                    />
                                </div>
                            ) : null}

                            {form.type === 'facture' ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="due_date">
                                        Échéance de paiement
                                    </Label>
                                    <Input
                                        id="due_date"
                                        type="date"
                                        value={form.due_date}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                due_date: event.target.value,
                                            })
                                        }
                                    />
                                </div>
                            ) : null}

                            {form.type === 'bon_livraison' ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="delivery_date">
                                        Date de livraison
                                    </Label>
                                    <Input
                                        id="delivery_date"
                                        type="date"
                                        value={form.delivery_date}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                delivery_date:
                                                    event.target.value,
                                            })
                                        }
                                    />
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Totaux</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            <div className="grid gap-2">
                                <Label htmlFor="discount">Remise globale</Label>
                                <Input
                                    id="discount"
                                    value={form.discount}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            discount: event.target.value,
                                        })
                                    }
                                    placeholder="0"
                                    inputMode="numeric"
                                    className="text-right tabular-nums"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="tax_rate">
                                    {defaults.taxLabel} (%)
                                </Label>
                                <Input
                                    id="tax_rate"
                                    value={form.tax_rate}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            tax_rate:
                                                event.target.value.replace(
                                                    /[^\d.]/g,
                                                    '',
                                                ),
                                        })
                                    }
                                    inputMode="decimal"
                                    className="text-right tabular-nums"
                                />
                            </div>

                            {form.type === 'facture' ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="amount_paid">
                                        Montant déjà réglé
                                    </Label>
                                    <Input
                                        id="amount_paid"
                                        value={form.amount_paid}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                amount_paid: event.target.value,
                                            })
                                        }
                                        placeholder="0"
                                        inputMode="numeric"
                                        className="text-right tabular-nums"
                                    />
                                </div>
                            ) : null}

                            <div className="mt-1 space-y-1 border-t pt-3 text-sm">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Sous-total</span>
                                    <span className="tabular-nums">
                                        {money(totals.subtotal)}
                                    </span>
                                </div>
                                {totals.globalDiscount > 0 ? (
                                    <div className="flex justify-between text-muted-foreground">
                                        <span>Remise</span>
                                        <span className="tabular-nums">
                                            −{money(totals.globalDiscount)}
                                        </span>
                                    </div>
                                ) : null}
                                {totals.taxAmount > 0 ? (
                                    <div className="flex justify-between text-muted-foreground">
                                        <span>{defaults.taxLabel}</span>
                                        <span className="tabular-nums">
                                            {money(totals.taxAmount)}
                                        </span>
                                    </div>
                                ) : null}
                                <div className="flex justify-between text-base font-semibold">
                                    <span>Total</span>
                                    <span className="tabular-nums">
                                        {money(totals.total)}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Lignes</CardTitle>
                        <CardDescription>
                            Ajoutez des articles du catalogue ou des lignes
                            libres (transport, service…).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <VariantPicker
                                variants={variants}
                                onSelect={addVariant}
                                className="min-w-64 flex-1 sm:max-w-xl"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={addFreeLine}
                            >
                                <Plus className="size-4" />
                                Ligne libre
                            </Button>
                        </div>

                        <InputError message={errors.lines} />

                        {lines.length === 0 ? (
                            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                                Aucune ligne pour l'instant.
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Désignation</TableHead>
                                        <TableHead className="w-24 text-right">
                                            Qté
                                        </TableHead>
                                        <TableHead className="w-36 text-right">
                                            Prix unitaire
                                        </TableHead>
                                        <TableHead className="w-32 text-right">
                                            Remise
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Total
                                        </TableHead>
                                        <TableHead className="w-10" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lines.map((line, index) => {
                                        const lineTotal = Math.max(
                                            0,
                                            parseAmount(line.unit_price) *
                                                line.quantity -
                                                parseAmount(line.discount),
                                        );

                                        return (
                                            <TableRow key={index}>
                                                <TableCell>
                                                    <Input
                                                        value={line.designation}
                                                        onChange={(event) =>
                                                            updateLine(index, {
                                                                designation:
                                                                    event.target
                                                                        .value,
                                                            })
                                                        }
                                                        placeholder="Désignation"
                                                        className="h-8"
                                                        required
                                                    />
                                                    <Input
                                                        value={line.description}
                                                        onChange={(event) =>
                                                            updateLine(index, {
                                                                description:
                                                                    event.target
                                                                        .value,
                                                            })
                                                        }
                                                        placeholder="Précision (facultatif)"
                                                        className="mt-1 h-7 text-xs"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={String(
                                                            line.quantity,
                                                        )}
                                                        onChange={(event) =>
                                                            updateLine(index, {
                                                                quantity:
                                                                    Number(
                                                                        event.target.value.replace(
                                                                            /\D/g,
                                                                            '',
                                                                        ),
                                                                    ) || 1,
                                                            })
                                                        }
                                                        inputMode="numeric"
                                                        className="h-8 text-right tabular-nums"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={line.unit_price}
                                                        onChange={(event) =>
                                                            updateLine(index, {
                                                                unit_price:
                                                                    event.target
                                                                        .value,
                                                            })
                                                        }
                                                        inputMode="numeric"
                                                        placeholder="0"
                                                        className="h-8 text-right tabular-nums"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={line.discount}
                                                        onChange={(event) =>
                                                            updateLine(index, {
                                                                discount:
                                                                    event.target
                                                                        .value,
                                                            })
                                                        }
                                                        inputMode="numeric"
                                                        placeholder="0"
                                                        className="h-8 text-right tabular-nums"
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right font-medium tabular-nums">
                                                    {money(lineTotal)}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() =>
                                                            setLines(
                                                                (current) =>
                                                                    current.filter(
                                                                        (
                                                                            _,
                                                                            i,
                                                                        ) =>
                                                                            i !==
                                                                            index,
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
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                        <Label htmlFor="notes">Note</Label>
                        <Textarea
                            id="notes"
                            value={form.notes}
                            onChange={(event) =>
                                setForm({ ...form, notes: event.target.value })
                            }
                            rows={3}
                            placeholder="Information affichée sur le document…"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="terms">Conditions</Label>
                        <Textarea
                            id="terms"
                            value={form.terms}
                            onChange={(event) =>
                                setForm({ ...form, terms: event.target.value })
                            }
                            rows={3}
                        />
                    </div>
                </div>
            </form>
        </>
    );
}

DocumentForm.layout = {
    breadcrumbs: [
        { title: 'Documents', href: '/documents' },
        { title: 'Formulaire', href: '#' },
    ],
};
