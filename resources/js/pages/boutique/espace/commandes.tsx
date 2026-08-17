import { Head, Link, router } from '@inertiajs/react';
import { PackageCheck } from 'lucide-react';
import { EspaceNav } from '@/components/boutique/espace-nav';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { count, dateTime, money } from '@/lib/format';
import type { Paginated } from '@/types';
import type { StatusTone } from '@/types/senvalise';

type OrderRow = {
    id: number;
    reference: string;
    token: string;
    statusLabel: string;
    statusTone: StatusTone;
    total: number;
    itemCount: number;
    placedAt: string | null;
    canCancel: boolean;
    items: Array<{ designation: string; quantity: number; lineTotal: number }>;
};

export default function EspaceCommandes({
    orders,
}: {
    orders: Paginated<OrderRow>;
}) {
    return (
        <>
            <Head title="Mes commandes" />

            <div className="mx-auto max-w-4xl px-4 py-8">
                <h1 className="mb-6 text-2xl font-semibold tracking-tight">
                    Mes commandes
                </h1>

                <EspaceNav />

                {orders.data.length === 0 ? (
                    <div className="verre">
                        <EmptyState
                            icon={PackageCheck}
                            title="Aucune commande"
                            description="Vos commandes apparaîtront ici avec leur suivi."
                            action={
                                <Button asChild>
                                    <Link href="/boutique/catalogue">
                                        Voir les valises
                                    </Link>
                                </Button>
                            }
                        />
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {orders.data.map((order, index) => (
                            <li
                                key={order.id}
                                style={{ animationDelay: `${index * 40}ms` }}
                                className="anim-entree verre"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                                    <div className="min-w-0">
                                        <p className="font-medium">
                                            {order.reference}
                                        </p>
                                        <p className="text-xs text-[var(--vitrine-encre)]/60">
                                            {dateTime(order.placedAt)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <StatusBadge
                                            label={order.statusLabel}
                                            tone={order.statusTone}
                                        />
                                        <span className="font-semibold tabular-nums">
                                            {money(order.total)}
                                        </span>
                                    </div>
                                </div>

                                <ul className="space-y-1.5 p-4 text-sm">
                                    {order.items.map((item) => (
                                        <li
                                            key={item.designation}
                                            className="flex justify-between gap-3"
                                        >
                                            <span className="min-w-0 truncate text-[var(--vitrine-encre)]/60">
                                                {item.quantity} ×{' '}
                                                {item.designation}
                                            </span>
                                            <span className="shrink-0 tabular-nums">
                                                {money(item.lineTotal)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
                                    <span className="text-xs text-[var(--vitrine-encre)]/60">
                                        {count(order.itemCount)} article
                                        {order.itemCount > 1 ? 's' : ''}
                                    </span>

                                    <div className="flex gap-2">
                                        {order.canCancel ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    router.post(
                                                        `/boutique/espace/commandes/${order.id}/annuler`,
                                                        {},
                                                        {
                                                            preserveScroll: true,
                                                        },
                                                    )
                                                }
                                                className="text-[var(--vitrine-encre)]/60 hover:text-destructive"
                                            >
                                                Annuler
                                            </Button>
                                        ) : null}
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Link
                                                href={`/boutique/suivi/${order.token}`}
                                            >
                                                Suivre
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="mt-6">
                    <DataPagination
                        links={orders.links}
                        from={orders.from}
                        to={orders.to}
                        total={orders.total}
                        label="commandes"
                    />
                </div>
            </div>
        </>
    );
}
