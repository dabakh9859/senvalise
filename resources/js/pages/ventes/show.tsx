import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, Ban, FileText, Printer, Truck } from 'lucide-react';
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { dateTime, money } from '@/lib/format';

type Sale = {
    id: number;
    reference: string;
    soldAt: string | null;
    subtotal: number;
    discount: number;
    total: number;
    amountPaid: number;
    changeDue: number;
    paymentLabel: string;
    channelLabel: string;
    status: string;
    statusLabel: string;
    note?: string;
    seller?: string;
    customer?: { id: number; name: string; phone: string | null };
    profit?: number;
    totalCost?: number;
};

type Item = {
    id: number;
    designation: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    productId?: number;
    unitCost?: number;
    profit?: number;
};

type RelatedDocument = {
    id: number;
    type: string;
    typeLabel: string;
    reference: string;
};

export default function VenteShow({
    sale,
    items,
    documents,
    canCancel,
}: {
    sale: Sale;
    items: Item[];
    documents: RelatedDocument[];
    canCancel: boolean;
}) {
    const showMargin = sale.profit !== undefined;

    return (
        <>
            <Head title={`Vente ${sale.reference}`} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={`Vente ${sale.reference}`}
                    description={
                        <span className="flex flex-wrap items-center gap-2">
                            <span>{dateTime(sale.soldAt)}</span>
                            <span>· {sale.channelLabel}</span>
                            <span>· {sale.paymentLabel}</span>
                            {sale.status !== 'validee' ? (
                                <StatusBadge
                                    label={sale.statusLabel}
                                    tone="danger"
                                />
                            ) : null}
                        </span>
                    }
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href="/ventes">
                                    <ArrowLeft className="size-4" />
                                    Retour
                                </Link>
                            </Button>

                            <Button asChild variant="outline">
                                <a
                                    href={`/ventes/${sale.id}/ticket`}
                                    target="_blank"
                                    rel="noopener"
                                >
                                    <Printer className="size-4" />
                                    Ticket
                                </a>
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() =>
                                    router.post(`/ventes/${sale.id}/document`, {
                                        type: 'facture',
                                    })
                                }
                            >
                                <FileText className="size-4" />
                                Facture
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() =>
                                    router.post(`/ventes/${sale.id}/document`, {
                                        type: 'bon_livraison',
                                    })
                                }
                            >
                                <Truck className="size-4" />
                                Bon de livraison
                            </Button>

                            {canCancel ? <CancelSale sale={sale} /> : null}
                        </>
                    }
                />

                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Articles vendus</CardTitle>
                        </CardHeader>
                        <CardContent className="px-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Article</TableHead>
                                        <TableHead className="text-right">
                                            Qté
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Prix unitaire
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Total
                                        </TableHead>
                                        {showMargin ? (
                                            <TableHead className="text-right">
                                                Marge
                                            </TableHead>
                                        ) : null}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                {item.productId ? (
                                                    <Link
                                                        href={`/produits/${item.productId}`}
                                                        className="font-medium hover:underline"
                                                    >
                                                        {item.designation}
                                                    </Link>
                                                ) : (
                                                    <span className="font-medium">
                                                        {item.designation}
                                                    </span>
                                                )}
                                                {item.sku ? (
                                                    <span className="block font-mono text-xs text-muted-foreground">
                                                        {item.sku}
                                                    </span>
                                                ) : null}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {item.quantity}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {money(item.unitPrice)}
                                                {item.discount > 0 ? (
                                                    <span className="block text-xs text-muted-foreground">
                                                        remise −
                                                        {money(item.discount)}
                                                    </span>
                                                ) : null}
                                            </TableCell>
                                            <TableCell className="text-right font-medium tabular-nums">
                                                {money(item.lineTotal)}
                                            </TableCell>
                                            {showMargin ? (
                                                <TableCell className="text-right text-emerald-600 tabular-nums dark:text-emerald-400">
                                                    {money(item.profit ?? 0)}
                                                </TableCell>
                                            ) : null}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Récapitulatif
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <Line
                                    label="Sous-total"
                                    value={money(sale.subtotal)}
                                />
                                {sale.discount > 0 ? (
                                    <Line
                                        label="Remise"
                                        value={`−${money(sale.discount)}`}
                                    />
                                ) : null}
                                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                                    <span>Total</span>
                                    <span className="tabular-nums">
                                        {money(sale.total)}
                                    </span>
                                </div>
                                <Line
                                    label={`Réglé (${sale.paymentLabel})`}
                                    value={money(sale.amountPaid)}
                                />
                                {sale.changeDue > 0 ? (
                                    <Line
                                        label="Monnaie rendue"
                                        value={money(sale.changeDue)}
                                    />
                                ) : null}
                                {showMargin ? (
                                    <>
                                        <div className="border-t pt-2" />
                                        <Line
                                            label="Prix de revient"
                                            value={money(sale.totalCost ?? 0)}
                                        />
                                        <div className="flex justify-between font-medium text-emerald-600 dark:text-emerald-400">
                                            <span>Marge</span>
                                            <span className="tabular-nums">
                                                {money(sale.profit ?? 0)}
                                            </span>
                                        </div>
                                    </>
                                ) : null}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Informations
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <Line
                                    label="Client"
                                    value={
                                        sale.customer?.name ??
                                        'Client de passage'
                                    }
                                />
                                {sale.customer?.phone ? (
                                    <Line
                                        label="Téléphone"
                                        value={sale.customer.phone}
                                    />
                                ) : null}
                                <Line
                                    label="Vendeur"
                                    value={sale.seller ?? '—'}
                                />
                                {sale.note ? (
                                    <p className="border-t pt-2 whitespace-pre-line text-muted-foreground">
                                        {sale.note}
                                    </p>
                                ) : null}
                            </CardContent>
                        </Card>

                        {documents.length > 0 ? (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">
                                        Documents liés
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1">
                                    {documents.map((document) => (
                                        <Link
                                            key={document.id}
                                            href={`/documents/${document.id}`}
                                            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                                        >
                                            <span>{document.typeLabel}</span>
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {document.reference}
                                            </span>
                                        </Link>
                                    ))}
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
            <span className="text-right tabular-nums">{value}</span>
        </div>
    );
}

function CancelSale({ sale }: { sale: Sale }) {
    const [reason, setReason] = useState('');

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="text-destructive">
                    <Ban className="size-4" />
                    Annuler la vente
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Annuler cette vente ?</DialogTitle>
                    <DialogDescription>
                        Les {money(sale.total)} de la vente {sale.reference}{' '}
                        seront annulés et les articles remis en stock. La vente
                        reste visible dans l'historique avec le statut « Annulée
                        ».
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-2">
                    <Label htmlFor="motif">Motif (facultatif)</Label>
                    <Input
                        id="motif"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Erreur de saisie, retour client…"
                    />
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Fermer</Button>
                    </DialogClose>
                    <Button
                        variant="destructive"
                        onClick={() =>
                            router.post(
                                `/ventes/${sale.id}/annuler`,
                                { reason: reason || null },
                                { preserveScroll: true },
                            )
                        }
                    >
                        Confirmer l'annulation
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

VenteShow.layout = {
    breadcrumbs: [
        { title: 'Ventes', href: '/ventes' },
        { title: 'Détail', href: '#' },
    ],
};
