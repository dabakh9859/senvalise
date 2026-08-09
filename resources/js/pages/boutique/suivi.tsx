import { Head, Link, router } from '@inertiajs/react';
import {
    CheckCircle2,
    CircleDashed,
    PackageCheck,
    Search,
    Truck,
    XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dateTime, money } from '@/lib/format';
import { cn } from '@/lib/utils';

type Order = {
    reference: string;
    status: string;
    statusLabel: string;
    statusDescription: string;
    step: number;
    placedAt: string | null;
    confirmedAt: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    cancelReason: string | null;
    customerName: string;
    customerPhone: string;
    address: string;
    city: string | null;
    zone: string | null;
    delayLabel: string | null;
    subtotal: number;
    deliveryFee: number;
    total: number;
    amountPaid: number;
    balanceDue: number;
    paymentLabel: string;
    items: Array<{
        designation: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
    }>;
};

const ETAPES = [
    { step: 1, label: 'Commande reçue' },
    { step: 2, label: 'Confirmée' },
    { step: 3, label: 'Colis prêt' },
    { step: 4, label: 'En livraison' },
    { step: 5, label: 'Livrée' },
];

export default function Suivi({ order }: { order: Order }) {
    const annulee = order.step === 0;

    return (
        <>
            <Head title={`Commande ${order.reference}`} />

            <div className="mx-auto max-w-3xl px-4 py-8">
                <header className="mb-6 space-y-1">
                    <p className="text-sm text-muted-foreground">
                        Commande {order.reference}
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {order.statusLabel}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {order.statusDescription}
                    </p>
                </header>

                {/* ------------------------------------------ Progression */}
                {annulee ? (
                    <div className="flex items-start gap-3 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
                        <XCircle className="mt-0.5 size-4 shrink-0" />
                        <span>
                            Cette commande a été annulée.
                            {order.cancelReason
                                ? ` Motif : ${order.cancelReason}.`
                                : ''}
                        </span>
                    </div>
                ) : (
                    <ol className="verre p-4 sm:p-5">
                        {ETAPES.map((etape, index) => {
                            const done = order.step >= etape.step;
                            const current = order.step === etape.step;

                            return (
                                <li
                                    key={etape.step}
                                    style={{
                                        animationDelay: `${index * 70}ms`,
                                    }}
                                    className="anim-entree flex gap-3"
                                >
                                    <div className="flex flex-col items-center">
                                        <span
                                            className={cn(
                                                'flex size-7 shrink-0 items-center justify-center transition-colors',
                                                done
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-muted text-muted-foreground',
                                            )}
                                        >
                                            {done ? (
                                                <CheckCircle2 className="size-4" />
                                            ) : (
                                                <CircleDashed className="size-4" />
                                            )}
                                        </span>
                                        {index < ETAPES.length - 1 ? (
                                            <span
                                                className={cn(
                                                    'w-0.5 flex-1',
                                                    order.step > etape.step
                                                        ? 'bg-emerald-600'
                                                        : 'bg-border',
                                                )}
                                            />
                                        ) : null}
                                    </div>

                                    <div
                                        className={cn(
                                            'pb-5',
                                            index === ETAPES.length - 1 &&
                                                'pb-0',
                                        )}
                                    >
                                        <p
                                            className={cn(
                                                'text-sm',
                                                current && 'font-semibold',
                                                !done &&
                                                    'text-muted-foreground',
                                            )}
                                        >
                                            {etape.label}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {horodatage(order, etape.step)}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}

                {/* ------------------------------------------ Détail */}
                <section className="verre mt-6 space-y-4 p-4 sm:p-5">
                    <h2 className="flex items-center gap-2 font-medium">
                        <PackageCheck className="size-4" />
                        Votre commande
                    </h2>

                    <ul className="space-y-2 border-b pb-3 text-sm">
                        {order.items.map((item) => (
                            <li
                                key={item.designation}
                                className="flex justify-between gap-3"
                            >
                                <span className="min-w-0 text-muted-foreground">
                                    {item.quantity} × {item.designation}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                    {money(item.lineTotal)}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <dl className="space-y-1.5 text-sm">
                        <Ligne
                            label="Sous-total"
                            value={money(order.subtotal)}
                        />
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
                        {order.balanceDue > 0 ? (
                            <p className="pt-1 text-xs text-muted-foreground">
                                À régler à la livraison :{' '}
                                {money(order.balanceDue)} ({order.paymentLabel})
                            </p>
                        ) : (
                            <p className="pt-1 text-xs text-emerald-600 dark:text-emerald-400">
                                Déjà réglé.
                            </p>
                        )}
                    </dl>
                </section>

                <section className="verre mt-4 space-y-2 p-4 text-sm sm:p-5">
                    <h2 className="flex items-center gap-2 font-medium">
                        <Truck className="size-4" />
                        Livraison
                    </h2>
                    <p>{order.customerName}</p>
                    <p className="text-muted-foreground">
                        {order.customerPhone}
                    </p>
                    <p className="text-muted-foreground">
                        {order.address}
                        {order.city ? `, ${order.city}` : ''}
                    </p>
                    {order.delayLabel ? (
                        <p className="text-muted-foreground">
                            {order.delayLabel}
                        </p>
                    ) : null}
                </section>

                <div className="mt-6 text-center">
                    <Link
                        href="/boutique/catalogue"
                        className="text-sm font-medium underline underline-offset-4"
                    >
                        Continuer mes achats
                    </Link>
                </div>
            </div>
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

function horodatage(order: Order, step: number): string {
    const dates: Record<number, string | null> = {
        1: order.placedAt,
        2: order.confirmedAt,
        4: order.shippedAt,
        5: order.deliveredAt,
    };

    const date = dates[step];

    return date ? dateTime(date) : '—';
}

/**
 * Recherche d'une commande par numéro et téléphone.
 *
 * Le lien de suivi se perd — dans une conversation WhatsApp, dans un SMS
 * effacé. Ces deux informations sont ce que le client a toujours sous la main.
 */
export function RechercheSuivi() {
    const [form, setForm] = useState({ reference: '', phone: '' });

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                router.post('/boutique/suivi', form);
            }}
            className="space-y-3"
        >
            <div className="grid gap-2">
                <Label htmlFor="ref">Numéro de commande</Label>
                <Input
                    id="ref"
                    value={form.reference}
                    onChange={(event) =>
                        setForm({ ...form, reference: event.target.value })
                    }
                    placeholder="C-2026-0001"
                    className="h-11 sm:h-9"
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="tel">Téléphone</Label>
                <Input
                    id="tel"
                    type="tel"
                    value={form.phone}
                    onChange={(event) =>
                        setForm({ ...form, phone: event.target.value })
                    }
                    placeholder="77 000 00 00"
                    className="h-11 sm:h-9"
                />
            </div>
            <Button type="submit" className="w-full">
                <Search className="size-4" />
                Retrouver ma commande
            </Button>
        </form>
    );
}
