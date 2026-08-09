import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    Check,
    Copy,
    MapPin,
    PiggyBank,
    Receipt,
    Truck,
    XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { count, dateTime, money } from '@/lib/format';
import type { Option, SharedProps } from '@/types';
import type { StatusTone } from '@/types/senvalise';

type Order = {
    id: number;
    reference: string;
    status: string;
    statusLabel: string;
    statusTone: StatusTone;
    step: number;
    customerName: string;
    customerPhone: string;
    email: string | null;
    customerLabel: string | null;
    customerId: number | null;
    address: string;
    city: string | null;
    zone: string | null;
    deliveryNote: string | null;
    hasLocation: boolean;
    mapUrl: string | null;
    accuracyLabel: string | null;
    coordinates: string | null;
    note: string | null;
    cancelReason: string | null;
    subtotal: number;
    deliveryFee: number;
    total: number;
    amountPaid: number;
    balanceDue: number;
    paymentLabel: string;
    itemCount: number;
    placedAt: string | null;
    confirmedAt: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    saleId: number | null;
    saleReference: string | null;
    vaultReference: string | null;
    trackingUrl: string;
    lines: Array<{
        designation: string;
        sku: string | null;
        productId: number | null;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
    }>;
};

/** L'étape suivante, et le mot qui la déclenche. */
const SUITE: Record<string, { status: string; label: string }> = {
    en_attente: { status: 'confirmee', label: 'Confirmer la commande' },
    confirmee: { status: 'preparee', label: 'Marquer le colis prêt' },
    preparee: { status: 'expediee', label: 'Partie en livraison' },
    expediee: { status: 'livree', label: 'Marquer livrée' },
};

export default function CommandeShow({ order }: { order: Order; statuses: Option[] }) {
    const { auth } = usePage<SharedProps>().props;
    const [cancelling, setCancelling] = useState(false);
    const [reason, setReason] = useState('');
    const [copied, setCopied] = useState(false);

    const suite = SUITE[order.status];

    return (
        <>
            <Head title={`Commande ${order.reference}`} />

            <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
                <Link
                    href="/commandes"
                    className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                    Toutes les commandes
                </Link>

                <PageHeader
                    title={order.reference}
                    description={`Passée le ${dateTime(order.placedAt)}`}
                    actions={
                        <>
                            {suite ? (
                                <Button
                                    onClick={() =>
                                        router.post(
                                            `/commandes/${order.id}/etape`,
                                            { status: suite.status },
                                            { preserveScroll: true },
                                        )
                                    }
                                >
                                    <Check className="size-4" />
                                    {suite.label}
                                </Button>
                            ) : null}
                            {auth.isGerant && order.status !== 'annulee' ? (
                                <Button
                                    variant="outline"
                                    onClick={() => setCancelling(true)}
                                    className="text-destructive"
                                >
                                    <XCircle className="size-4" />
                                    Annuler
                                </Button>
                            ) : null}
                        </>
                    }
                />

                <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge
                        label={order.statusLabel}
                        tone={order.statusTone}
                    />
                    {order.vaultReference ? (
                        <span className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400">
                            <PiggyBank className="size-4" />
                            Payée par le coffre {order.vaultReference}
                        </span>
                    ) : null}
                    {order.saleReference ? (
                        <Link
                            href={`/ventes/${order.saleId}`}
                            className="flex items-center gap-1.5 text-sm underline underline-offset-4"
                        >
                            <Receipt className="size-4" />
                            Vente {order.saleReference}
                        </Link>
                    ) : null}
                </div>

                {order.cancelReason ? (
                    <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                        Annulée : {order.cancelReason}
                    </p>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                    {/* ------------------------------------ Articles */}
                    <section className="rounded-xl border bg-card">
                        <h2 className="border-b px-4 py-3 font-medium">
                            Articles ({count(order.itemCount)})
                        </h2>

                        <ul className="divide-y">
                            {order.lines.map((line) => (
                                <li
                                    key={line.designation}
                                    className="flex items-start justify-between gap-3 px-4 py-3"
                                >
                                    <span className="min-w-0">
                                        {line.productId ? (
                                            <Link
                                                href={`/produits/${line.productId}`}
                                                className="text-sm font-medium hover:underline"
                                            >
                                                {line.designation}
                                            </Link>
                                        ) : (
                                            <span className="text-sm font-medium">
                                                {line.designation}
                                            </span>
                                        )}
                                        <span className="block font-mono text-xs text-muted-foreground">
                                            {line.sku}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right text-sm">
                                        <span className="block tabular-nums">
                                            {line.quantity} ×{' '}
                                            {money(line.unitPrice)}
                                        </span>
                                        <span className="block font-medium tabular-nums">
                                            {money(line.lineTotal)}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <dl className="space-y-1.5 border-t p-4 text-sm">
                            <Ligne label="Sous-total" value={money(order.subtotal)} />
                            <Ligne
                                label={`Livraison${order.zone ? ` — ${order.zone}` : ''}`}
                                value={
                                    order.deliveryFee === 0
                                        ? 'Offerte'
                                        : money(order.deliveryFee)
                                }
                            />
                            <div className="flex justify-between border-t pt-2 text-base font-semibold">
                                <dt>Total</dt>
                                <dd className="tabular-nums">
                                    {money(order.total)}
                                </dd>
                            </div>
                            <Ligne
                                label="Encaissé"
                                value={money(order.amountPaid)}
                            />
                            {order.balanceDue > 0 ? (
                                <p className="pt-1 text-xs text-amber-600 dark:text-amber-400">
                                    Reste {money(order.balanceDue)} à encaisser (
                                    {order.paymentLabel})
                                </p>
                            ) : null}
                        </dl>
                    </section>

                    {/* ------------------------------------ Livraison */}
                    <aside className="h-fit space-y-4">
                        <section className="space-y-2 rounded-xl border bg-card p-4 text-sm">
                            <h2 className="flex items-center gap-2 font-medium">
                                <Truck className="size-4" />
                                Livraison
                            </h2>
                            <p className="font-medium">{order.customerName}</p>
                            <p className="text-muted-foreground">
                                <a
                                    href={`tel:${order.customerPhone.replace(/\s/g, '')}`}
                                    className="underline underline-offset-4"
                                >
                                    {order.customerPhone}
                                </a>
                            </p>
                            {order.email ? (
                                <p className="break-all text-muted-foreground">
                                    {order.email}
                                </p>
                            ) : null}
                            <p className="text-muted-foreground">
                                {order.address}
                                {order.city ? `, ${order.city}` : ''}
                            </p>
                            {order.deliveryNote ? (
                                <p className="rounded-md bg-muted px-2 py-1.5 text-xs">
                                    {order.deliveryNote}
                                </p>
                            ) : null}
                            {/*
                             * Le lien s'ouvre dans l'application de navigation
                             * du téléphone : c'est ce dont le livreur a besoin
                             * sur le terrain, pas d'une carte à recopier.
                             */}
                            {order.hasLocation && order.mapUrl ? (
                                <a
                                    href={order.mapUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-start gap-2 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 transition-opacity hover:opacity-80 dark:text-blue-300"
                                >
                                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                                    <span>
                                        <span className="block font-medium">
                                            Position partagée par le client
                                        </span>
                                        <span className="block tabular-nums">
                                            {order.coordinates}
                                            {order.accuracyLabel
                                                ? ` \u00b7 ${order.accuracyLabel}`
                                                : ''}
                                        </span>
                                        <span className="block underline underline-offset-4">
                                            Ouvrir dans la carte
                                        </span>
                                    </span>
                                </a>
                            ) : null}

                            {order.customerId ? (
                                <Link
                                    href="/clients"
                                    className="inline-block text-xs underline underline-offset-4"
                                >
                                    Fiche client
                                </Link>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Commande sans compte.
                                </p>
                            )}
                        </section>

                        {order.note ? (
                            <section className="rounded-xl border bg-card p-4 text-sm">
                                <h2 className="mb-1 font-medium">
                                    Message du client
                                </h2>
                                <p className="whitespace-pre-line text-muted-foreground">
                                    {order.note}
                                </p>
                            </section>
                        ) : null}

                        <section className="space-y-2 rounded-xl border bg-card p-4">
                            <h2 className="text-sm font-medium">
                                Lien de suivi client
                            </h2>
                            <div className="flex items-center gap-2">
                                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
                                    {order.trackingUrl}
                                </code>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                        await navigator.clipboard.writeText(
                                            order.trackingUrl,
                                        );
                                        setCopied(true);
                                        window.setTimeout(
                                            () => setCopied(false),
                                            2000,
                                        );
                                    }}
                                >
                                    {copied ? (
                                        <Check className="size-4" />
                                    ) : (
                                        <Copy className="size-4" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                À envoyer par WhatsApp : fonctionne sans compte.
                            </p>
                        </section>
                    </aside>
                </div>
            </div>

            <Dialog open={cancelling} onOpenChange={setCancelling}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Annuler la commande</DialogTitle>
                    </DialogHeader>

                    <p className="text-sm text-muted-foreground">
                        {order.step >= 2
                            ? 'La marchandise reviendra en stock et la vente sera annulée.'
                            : 'La réservation de stock sera levée.'}
                    </p>

                    <div className="grid gap-2">
                        <Label htmlFor="reason">Motif</Label>
                        <Input
                            id="reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Client injoignable, rupture…"
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCancelling(false)}
                        >
                            Retour
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                router.post(
                                    `/commandes/${order.id}/annuler`,
                                    { reason },
                                    {
                                        preserveScroll: true,
                                        onFinish: () => setCancelling(false),
                                    },
                                )
                            }
                        >
                            Annuler la commande
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function Ligne({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
        </div>
    );
}

CommandeShow.layout = {
    breadcrumbs: [
        { title: 'Commandes', href: '/commandes' },
        { title: 'Détail', href: '#' },
    ],
};
