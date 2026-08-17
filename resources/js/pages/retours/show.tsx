import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, CheckCircle2, Ticket, User } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { amount, dateTime, money } from '@/lib/format';

type Item = {
    id: number;
    designation: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    restocked: boolean;
};

type ReturnPayload = {
    id: number;
    reference: string;
    returnedAt: string | null;
    customer: string | null;
    customerId: number | null;
    saleReference: string | null;
    saleId: number | null;
    reasonLabel: string;
    refundLabel: string;
    totalRefund: number;
    itemCount: number;
    restockedCount: number;
    isOpenCredit: boolean;
    creditUsedAt: string | null;
    user: string | null;
    note: string | null;
    items: Item[];
};

export default function RetourShow({
    return: retour,
}: {
    return: ReturnPayload;
}) {
    return (
        <>
            <Head title={`Retour ${retour.reference}`} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={`Retour ${retour.reference}`}
                    description={`Enregistré le ${dateTime(retour.returnedAt)}${
                        retour.user ? ` par ${retour.user}` : ''
                    }.`}
                    actions={
                        <>
                            <Button variant="outline" asChild>
                                <Link href="/retours">
                                    <ArrowLeft className="size-4" />
                                    Tous les retours
                                </Link>
                            </Button>
                            {retour.isOpenCredit ? (
                                <Button
                                    onClick={() =>
                                        router.post(
                                            `/retours/${retour.id}/avoir-utilise`,
                                            {},
                                            { preserveScroll: true },
                                        )
                                    }
                                >
                                    <CheckCircle2 className="size-4" />
                                    Marquer l'avoir comme utilisé
                                </Button>
                            ) : null}
                        </>
                    }
                />

                <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                        label="Dédommagement"
                        value={money(retour.totalRefund)}
                        hint={retour.refundLabel}
                        tone="warning"
                    />
                    <StatCard
                        label="Articles rendus"
                        value={String(retour.itemCount)}
                        hint={`${retour.restockedCount} remis en stock`}
                    />
                    <StatCard
                        label="Motif"
                        value={retour.reasonLabel}
                        hint={
                            retour.isOpenCredit
                                ? 'Avoir encore dû au client'
                                : retour.creditUsedAt
                                  ? `Avoir consommé le ${dateTime(retour.creditUsedAt)}`
                                  : undefined
                        }
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    {retour.customerId ? (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/clients/${retour.customerId}`}>
                                <User className="size-4" />
                                {retour.customer}
                            </Link>
                        </Button>
                    ) : null}
                    {retour.saleId ? (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/ventes/${retour.saleId}`}>
                                <Ticket className="size-4" />
                                Ticket {retour.saleReference}
                            </Link>
                        </Button>
                    ) : null}
                </div>

                <div className="rounded-xl border bg-card shadow-sm">
                    <div className="border-b p-4">
                        <h2 className="font-medium">Articles</h2>
                    </div>
                    <table className="w-full text-sm">
                        <thead className="border-b text-left text-muted-foreground">
                            <tr>
                                <th className="p-4 font-normal">Désignation</th>
                                <th className="p-4 text-right font-normal">
                                    Quantité
                                </th>
                                <th className="p-4 text-right font-normal">
                                    Prix
                                </th>
                                <th className="p-4 text-right font-normal">
                                    Total
                                </th>
                                <th className="p-4 text-right font-normal">
                                    Stock
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {retour.items.map((item) => (
                                <tr key={item.id}>
                                    <td className="p-4">{item.designation}</td>
                                    <td className="p-4 text-right tabular-nums">
                                        {item.quantity}
                                    </td>
                                    <td className="p-4 text-right tabular-nums">
                                        {amount(item.unitPrice)}
                                    </td>
                                    <td className="p-4 text-right font-medium tabular-nums">
                                        {amount(item.lineTotal)}
                                    </td>
                                    <td className="p-4 text-right">
                                        <StatusBadge
                                            label={
                                                item.restocked
                                                    ? 'Remis en rayon'
                                                    : 'Non remis'
                                            }
                                            tone={
                                                item.restocked
                                                    ? 'success'
                                                    : 'danger'
                                            }
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {retour.note ? (
                    <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
                        <span className="text-muted-foreground">Note : </span>
                        {retour.note}
                    </div>
                ) : null}
            </div>
        </>
    );
}

RetourShow.layout = {
    breadcrumbs: [
        { title: 'Retours', href: '/retours' },
        { title: 'Détail', href: '#' },
    ],
};
