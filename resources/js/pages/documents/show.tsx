import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRightLeft,
    Download,
    Pencil,
    Printer,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogClose,
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { date, money, parseAmount } from '@/lib/format';
import type { Option, StatusTone } from '@/types';

type Doc = {
    id: number;
    type: string;
    typeLabel: string;
    reference: string;
    customerId: number | null;
    customerName: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    issueDate: string | null;
    validUntil: string | null;
    dueDate: string | null;
    deliveryDate: string | null;
    subtotal: number;
    discount: number;
    taxRate: number;
    taxAmount: number;
    taxLabel: string;
    total: number;
    amountPaid: number;
    balanceDue: number;
    status: string;
    statusLabel: string;
    statusTone: StatusTone;
    notes: string | null;
    terms: string | null;
    author: string | null;
};

type Item = {
    id: number;
    designation: string;
    description: string | null;
    sku: string | null;
    quantity: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
};

type Related = {
    parent: { id: number; reference: string; typeLabel: string } | null;
    children: Array<{ id: number; reference: string; typeLabel: string }>;
    sale: { id: number; reference: string } | null;
};

export default function DocumentShow({
    document,
    items,
    related,
    statuses,
    convertTargets,
}: {
    document: Doc;
    items: Item[];
    related: Related;
    statuses: Option[];
    convertTargets: Option[];
}) {
    const isDelivery = document.type === 'bon_livraison';

    return (
        <>
            <Head title={`${document.typeLabel} ${document.reference}`} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={`${document.typeLabel} ${document.reference}`}
                    description={
                        <span className="flex flex-wrap items-center gap-2">
                            <span>Émis le {date(document.issueDate)}</span>
                            {document.customerName ? (
                                <span>· {document.customerName}</span>
                            ) : null}
                            <StatusBadge
                                label={document.statusLabel}
                                tone={document.statusTone}
                            />
                        </span>
                    }
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href="/documents">
                                    <ArrowLeft className="size-4" />
                                    Retour
                                </Link>
                            </Button>
                            <Button asChild variant="outline">
                                <a
                                    href={`/documents/${document.id}/impression`}
                                    target="_blank"
                                    rel="noopener"
                                >
                                    <Printer className="size-4" />
                                    Imprimer
                                </a>
                            </Button>
                            <Button asChild variant="outline">
                                <a href={`/documents/${document.id}/pdf`}>
                                    <Download className="size-4" />
                                    PDF
                                </a>
                            </Button>
                            {convertTargets.length > 0 ? (
                                <ConvertDialog
                                    document={document}
                                    targets={convertTargets}
                                />
                            ) : null}
                            <Button asChild>
                                <Link
                                    href={`/documents/${document.id}/modifier`}
                                >
                                    <Pencil className="size-4" />
                                    Modifier
                                </Link>
                            </Button>
                            <DeleteDocument document={document} />
                        </>
                    }
                />

                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Lignes</CardTitle>
                        </CardHeader>
                        <CardContent className="px-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Désignation</TableHead>
                                        <TableHead className="text-right">
                                            Qté
                                        </TableHead>
                                        {!isDelivery ? (
                                            <>
                                                <TableHead className="text-right">
                                                    Prix unitaire
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Remise
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    Total
                                                </TableHead>
                                            </>
                                        ) : null}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <span className="font-medium">
                                                    {item.designation}
                                                </span>
                                                {item.description ? (
                                                    <span className="block text-xs text-muted-foreground">
                                                        {item.description}
                                                    </span>
                                                ) : null}
                                                {item.sku ? (
                                                    <span className="block font-mono text-xs text-muted-foreground">
                                                        {item.sku}
                                                    </span>
                                                ) : null}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {item.quantity}
                                            </TableCell>
                                            {!isDelivery ? (
                                                <>
                                                    <TableCell className="text-right tabular-nums">
                                                        {money(item.unitPrice)}
                                                    </TableCell>
                                                    <TableCell className="text-right text-muted-foreground tabular-nums">
                                                        {item.discount > 0
                                                            ? `−${money(item.discount)}`
                                                            : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium tabular-nums">
                                                        {money(item.lineTotal)}
                                                    </TableCell>
                                                </>
                                            ) : null}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        {!isDelivery ? (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">
                                        Montants
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                    <Line
                                        label="Sous-total"
                                        value={money(document.subtotal)}
                                    />
                                    {document.discount > 0 ? (
                                        <Line
                                            label="Remise"
                                            value={`−${money(document.discount)}`}
                                        />
                                    ) : null}
                                    {document.taxAmount > 0 ? (
                                        <Line
                                            label={`${document.taxLabel} (${document.taxRate} %)`}
                                            value={money(document.taxAmount)}
                                        />
                                    ) : null}
                                    <div className="flex justify-between border-t pt-2 text-base font-semibold">
                                        <span>Total</span>
                                        <span className="tabular-nums">
                                            {money(document.total)}
                                        </span>
                                    </div>
                                    {document.amountPaid > 0 ? (
                                        <Line
                                            label="Déjà réglé"
                                            value={money(document.amountPaid)}
                                        />
                                    ) : null}
                                    {document.balanceDue > 0 ? (
                                        <div className="flex justify-between font-medium text-amber-600 dark:text-amber-400">
                                            <span>Reste à payer</span>
                                            <span className="tabular-nums">
                                                {money(document.balanceDue)}
                                            </span>
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>
                        ) : null}

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Statut
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <StatusForm
                                    document={document}
                                    statuses={statuses}
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Client
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <Line
                                    label="Nom"
                                    value={document.customerName ?? '—'}
                                />
                                {document.customerPhone ? (
                                    <Line
                                        label="Téléphone"
                                        value={document.customerPhone}
                                    />
                                ) : null}
                                {document.customerAddress ? (
                                    <Line
                                        label="Adresse"
                                        value={document.customerAddress}
                                    />
                                ) : null}
                                {document.validUntil ? (
                                    <Line
                                        label="Valable jusqu'au"
                                        value={date(document.validUntil)}
                                    />
                                ) : null}
                                {document.dueDate ? (
                                    <Line
                                        label="Échéance"
                                        value={date(document.dueDate)}
                                    />
                                ) : null}
                                {document.deliveryDate ? (
                                    <Line
                                        label="Livraison"
                                        value={date(document.deliveryDate)}
                                    />
                                ) : null}
                                <Line
                                    label="Établi par"
                                    value={document.author ?? '—'}
                                />
                            </CardContent>
                        </Card>

                        {related.parent ||
                        related.children.length > 0 ||
                        related.sale ? (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">
                                        Documents liés
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1">
                                    {related.parent ? (
                                        <RelatedLink
                                            href={`/documents/${related.parent.id}`}
                                            label={`Issu de : ${related.parent.typeLabel}`}
                                            reference={related.parent.reference}
                                        />
                                    ) : null}
                                    {related.children.map((child) => (
                                        <RelatedLink
                                            key={child.id}
                                            href={`/documents/${child.id}`}
                                            label={child.typeLabel}
                                            reference={child.reference}
                                        />
                                    ))}
                                    {related.sale ? (
                                        <RelatedLink
                                            href={`/ventes/${related.sale.id}`}
                                            label="Vente"
                                            reference={related.sale.reference}
                                        />
                                    ) : null}
                                </CardContent>
                            </Card>
                        ) : null}

                        {document.notes || document.terms ? (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">
                                        Notes et conditions
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm whitespace-pre-line text-muted-foreground">
                                    {document.notes}
                                    {document.notes && document.terms ? (
                                        <hr />
                                    ) : null}
                                    {document.terms}
                                </CardContent>
                            </Card>
                        ) : null}
                    </div>
                </div>
            </div>
        </>
    );
}

function Line({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right">{value}</span>
        </div>
    );
}

function RelatedLink({
    href,
    label,
    reference,
}: {
    href: string;
    label: string;
    reference: string;
}) {
    return (
        <Link
            href={href}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
        >
            <span>{label}</span>
            <span className="font-mono text-xs text-muted-foreground">
                {reference}
            </span>
        </Link>
    );
}

function StatusForm({
    document,
    statuses,
}: {
    document: Doc;
    statuses: Option[];
}) {
    const [status, setStatus] = useState(document.status);
    const [paid, setPaid] = useState(String(document.amountPaid || ''));

    const isInvoice = document.type === 'facture';

    return (
        <div className="space-y-3">
            <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {statuses.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {isInvoice ? (
                <div className="grid gap-1.5">
                    <Label htmlFor="paid" className="text-xs">
                        Montant encaissé
                    </Label>
                    <Input
                        id="paid"
                        value={paid}
                        onChange={(event) => setPaid(event.target.value)}
                        inputMode="numeric"
                        placeholder="0"
                        className="text-right tabular-nums"
                    />
                </div>
            ) : null}

            <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                    router.post(
                        `/documents/${document.id}/statut`,
                        {
                            status,
                            amount_paid: isInvoice ? parseAmount(paid) : null,
                        },
                        { preserveScroll: true },
                    )
                }
            >
                Mettre à jour le statut
            </Button>
        </div>
    );
}

function ConvertDialog({
    document,
    targets,
}: {
    document: Doc;
    targets: Option[];
}) {
    const [target, setTarget] = useState(targets[0]?.value ?? '');

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <ArrowRightLeft className="size-4" />
                    Transformer
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Transformer ce document</DialogTitle>
                    <DialogDescription>
                        Un nouveau document est créé avec les mêmes lignes.
                        L'original {document.reference} reste inchangé et les
                        deux restent liés.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-2">
                    <Label htmlFor="target">Transformer en</Label>
                    <Select value={target} onValueChange={setTarget}>
                        <SelectTrigger id="target" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {targets.map((option) => (
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

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Annuler</Button>
                    </DialogClose>
                    <Button
                        onClick={() =>
                            router.post(`/documents/${document.id}/convertir`, {
                                target,
                            })
                        }
                    >
                        Créer le document
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteDocument({ document }: { document: Doc }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="text-destructive">
                    <Trash2 className="size-4" />
                    Supprimer
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Supprimer ce document ?</DialogTitle>
                    <DialogDescription>
                        {document.typeLabel} {document.reference} sera
                        définitivement effacé. Les ventes et le stock ne sont
                        pas concernés.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Annuler</Button>
                    </DialogClose>
                    <Button
                        variant="destructive"
                        onClick={() =>
                            router.delete(`/documents/${document.id}`)
                        }
                    >
                        Supprimer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

DocumentShow.layout = {
    breadcrumbs: [
        { title: 'Documents', href: '/documents' },
        { title: 'Détail', href: '#' },
    ],
};
