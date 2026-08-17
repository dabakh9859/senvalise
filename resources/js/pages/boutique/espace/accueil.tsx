import { Head, Link } from '@inertiajs/react';
import { ArrowRight, PackageCheck, PiggyBank, Wallet } from 'lucide-react';
import { EspaceNav, VaultProgress } from '@/components/boutique/espace-nav';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { count, date, money } from '@/lib/format';
import type { StatusTone } from '@/types/senvalise';

type OrderCard = {
    id: number;
    reference: string;
    token: string;
    statusLabel: string;
    statusTone: StatusTone;
    total: number;
    itemCount: number;
    placedAt: string | null;
};

type VaultCard = {
    id: number;
    reference: string;
    label: string;
    target: number;
    saved: number;
    remaining: number;
    progress: number;
    statusLabel: string;
    statusTone: StatusTone;
    statusDescription: string;
};

export default function EspaceAccueil({
    customer,
    stats,
    orders,
    vaults,
}: {
    customer: { displayName: string };
    stats: {
        orders: number;
        openOrders: number;
        vaults: number;
        saved: number;
    };
    orders: OrderCard[];
    vaults: VaultCard[];
}) {
    return (
        <>
            <Head title="Mon espace" />

            <div className="mx-auto max-w-4xl px-4 py-8">
                <header className="mb-6">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Bonjour {customer.displayName}
                    </h1>
                </header>

                <EspaceNav />

                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Tuile
                        label="Commandes"
                        value={count(stats.orders)}
                        hint={
                            stats.openOrders > 0
                                ? `${stats.openOrders} en cours`
                                : 'Aucune en cours'
                        }
                        icon={PackageCheck}
                    />
                    <Tuile
                        label="Coffres actifs"
                        value={count(stats.vaults)}
                        hint="Mise de côté"
                        icon={PiggyBank}
                    />
                    <Tuile
                        label="Épargné"
                        value={money(stats.saved)}
                        hint="Dans vos coffres"
                        icon={Wallet}
                        className="col-span-2 sm:col-span-1"
                    />
                </div>

                {/* ------------------------------------------ Coffres */}
                {vaults.length > 0 ? (
                    <section className="mb-6 space-y-3">
                        <div className="flex items-end justify-between gap-3">
                            <h2 className="font-semibold">Mes coffres</h2>
                            <Link
                                href="/boutique/espace/coffres"
                                className="text-sm underline underline-offset-4"
                            >
                                Tout voir
                            </Link>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {vaults.slice(0, 4).map((vault, index) => (
                                <article
                                    key={vault.id}
                                    style={{
                                        animationDelay: `${index * 50}ms`,
                                    }}
                                    className="anim-entree verre space-y-3 p-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">
                                                {vault.label}
                                            </p>
                                            <p className="text-xs text-[var(--vitrine-encre)]/60">
                                                {vault.reference}
                                            </p>
                                        </div>
                                        <StatusBadge
                                            label={vault.statusLabel}
                                            tone={vault.statusTone}
                                        />
                                    </div>

                                    <VaultProgress progress={vault.progress} />

                                    <p className="flex justify-between text-sm tabular-nums">
                                        <span className="font-semibold">
                                            {money(vault.saved)}
                                        </span>
                                        <span className="text-[var(--vitrine-encre)]/60">
                                            sur {money(vault.target)}
                                        </span>
                                    </p>
                                </article>
                            ))}
                        </div>
                    </section>
                ) : (
                    <section className="anim-entree mb-6 flex flex-col items-start gap-3 border border-dashed p-5">
                        <span className="flex size-10 items-center justify-center bg-[var(--vitrine-terre)]/10 text-[var(--vitrine-terre)]">
                            <PiggyBank className="size-5" />
                        </span>
                        <div>
                            <p className="font-medium">
                                Ouvrez votre premier coffre
                            </p>
                            <p className="text-sm text-[var(--vitrine-encre)]/60">
                                Mettez de côté à votre rythme et achetez quand
                                l’objectif est atteint.
                            </p>
                        </div>
                        <Button asChild size="sm">
                            <Link href="/boutique/espace/coffres">
                                Ouvrir un coffre
                                <ArrowRight className="size-4" />
                            </Link>
                        </Button>
                    </section>
                )}

                {/* ------------------------------------------ Commandes */}
                <section className="space-y-3">
                    <div className="flex items-end justify-between gap-3">
                        <h2 className="font-semibold">Dernières commandes</h2>
                        <Link
                            href="/boutique/espace/commandes"
                            className="text-sm underline underline-offset-4"
                        >
                            Tout voir
                        </Link>
                    </div>

                    {orders.length === 0 ? (
                        <p className="border border-dashed p-5 text-center text-sm text-[var(--vitrine-encre)]/60">
                            Vous n’avez pas encore commandé.
                        </p>
                    ) : (
                        <ul className="verre divide-y">
                            {orders.map((order) => (
                                <li key={order.id} className="anim-entree">
                                    <Link
                                        href={`/boutique/suivi/${order.token}`}
                                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors active:bg-[var(--vitrine-sable)]"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium">
                                                {order.reference}
                                            </span>
                                            <span className="block text-xs text-[var(--vitrine-encre)]/60">
                                                {date(order.placedAt)} ·{' '}
                                                {count(order.itemCount)} article
                                                {order.itemCount > 1 ? 's' : ''}
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-3">
                                            <StatusBadge
                                                label={order.statusLabel}
                                                tone={order.statusTone}
                                            />
                                            <span className="text-sm font-semibold tabular-nums">
                                                {money(order.total)}
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </>
    );
}

function Tuile({
    label,
    value,
    hint,
    icon: Icon,
    className,
}: {
    label: string;
    value: string;
    hint: string;
    icon: typeof PiggyBank;
    className?: string;
}) {
    return (
        <div className={`anim-entree verre p-4 ${className ?? ''}`}>
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-[var(--vitrine-encre)]/60">
                    {label}
                </p>
                <Icon className="size-4 text-[var(--vitrine-encre)]/60" />
            </div>
            <p className="mt-1 truncate text-lg font-semibold">{value}</p>
            <p className="truncate text-xs text-[var(--vitrine-encre)]/60">
                {hint}
            </p>
        </div>
    );
}
