import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    CheckCircle2,
    Coins,
    Pencil,
    Trash2,
    TrendingUp,
    Truck,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { amount, count, date, dateTime, money, percent } from '@/lib/format';

type Arrival = {
    id: number;
    reference: string;
    supplier: string | null;
    supplierPhone: string | null;
    date: string | null;
    status: string;
    statusLabel: string;
    currency: string;
    exchangeRate: number;
    goodsCost: number;
    shippingCost: number;
    customsCost: number;
    otherCost: number;
    totalCost: number;
    totalQuantity: number;
    notes: string | null;
    receivedAt: string | null;
    createdBy: string | null;
    canEdit: boolean;
};

type Item = {
    id: number;
    variantId: number;
    productId: number | null;
    label: string | null;
    sku: string | null;
    quantity: number;
    unitCost: number;
    unitCostXof: number;
    landedUnitCost: number;
    lineTotal: number;
    sellingPrice: number | null;
    currentStock: number | null;
};

type Summary = {
    lines: number;
    total_quantity: number;
    goods_cost: number;
    extra_costs: number;
    total_cost: number;
    landed_total: number;
    expected_revenue: number;
    expected_margin: number;
    expected_margin_rate: number;
    average_unit_cost: number;
};

export default function ArrivageShow({
    arrival,
    items,
    summary,
}: {
    arrival: Arrival;
    items: Item[];
    summary: Summary;
}) {
    const received = arrival.status === 'receptionne';

    return (
        <>
            <Head title={`Arrivage ${arrival.reference}`} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={`Arrivage ${arrival.reference}`}
                    description={
                        <span className="flex flex-wrap items-center gap-2">
                            <span>{date(arrival.date)}</span>
                            {arrival.supplier ? (
                                <span>· {arrival.supplier}</span>
                            ) : null}
                            <StatusBadge
                                label={arrival.statusLabel}
                                tone={received ? 'success' : 'warning'}
                            />
                        </span>
                    }
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href="/arrivages">
                                    <ArrowLeft className="size-4" />
                                    Retour
                                </Link>
                            </Button>

                            {arrival.canEdit ? (
                                <>
                                    <Button asChild variant="outline">
                                        <Link
                                            href={`/arrivages/${arrival.id}/modifier`}
                                        >
                                            <Pencil className="size-4" />
                                            Modifier
                                        </Link>
                                    </Button>

                                    <DeleteArrival arrival={arrival} />

                                    <ReceiveArrival
                                        arrival={arrival}
                                        summary={summary}
                                    />
                                </>
                            ) : null}
                        </>
                    }
                />

                {received ? (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="size-4 shrink-0" />
                        Réceptionné le {dateTime(arrival.receivedAt)} — le stock
                        et les prix de revient ont été mis à jour.
                    </div>
                ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                        <Truck className="size-4 shrink-0" />
                        Brouillon : le stock n'a pas encore bougé. Cliquez sur «
                        Réceptionner » quand la marchandise est en rayon.
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Articles reçus"
                        value={count(summary.total_quantity)}
                        hint={`${summary.lines} référence${summary.lines > 1 ? 's' : ''}`}
                        icon={Truck}
                    />
                    <StatCard
                        label="Coût total"
                        value={money(summary.total_cost)}
                        hint={`dont ${money(summary.extra_costs)} de frais`}
                        icon={Coins}
                    />
                    <StatCard
                        label="Revient moyen"
                        value={money(summary.average_unit_cost)}
                        hint="Par article, frais inclus"
                    />
                    <StatCard
                        label="Marge prévisionnelle"
                        value={money(summary.expected_margin)}
                        hint={`${percent(summary.expected_margin_rate)} si tout est vendu au prix boutique`}
                        icon={TrendingUp}
                        tone="success"
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                    <Card>
                        <CardHeader>
                            <CardTitle>Détail des articles</CardTitle>
                            <CardDescription>
                                Le « revient réel » inclut la part de transport
                                et de douane affectée à chaque article.
                            </CardDescription>
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
                                            Achat ({arrival.currency})
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Revient réel
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Prix de vente
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Marge unitaire
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item) => {
                                        const margin =
                                            (item.sellingPrice ?? 0) -
                                            item.landedUnitCost;
                                        const rate =
                                            item.sellingPrice &&
                                            item.sellingPrice > 0
                                                ? Math.round(
                                                      (margin /
                                                          item.sellingPrice) *
                                                          1000,
                                                  ) / 10
                                                : 0;

                                        return (
                                            <TableRow key={item.id}>
                                                <TableCell>
                                                    {item.productId ? (
                                                        <Link
                                                            href={`/produits/${item.productId}`}
                                                            className="font-medium hover:underline"
                                                        >
                                                            {item.label}
                                                        </Link>
                                                    ) : (
                                                        <span className="font-medium">
                                                            {item.label}
                                                        </span>
                                                    )}
                                                    <span className="block font-mono text-xs text-muted-foreground">
                                                        {item.sku}
                                                        {received &&
                                                        item.currentStock !==
                                                            null
                                                            ? ` · stock actuel ${item.currentStock}`
                                                            : ''}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {item.quantity}
                                                </TableCell>
                                                <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                                                    {item.unitCost}
                                                    {arrival.currency !==
                                                    'XOF' ? (
                                                        <span className="block text-xs">
                                                            {amount(
                                                                item.unitCostXof,
                                                            )}{' '}
                                                            FCFA
                                                        </span>
                                                    ) : null}
                                                </TableCell>
                                                <TableCell className="text-right font-medium tabular-nums">
                                                    {money(item.landedUnitCost)}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {item.sellingPrice
                                                        ? money(
                                                              item.sellingPrice,
                                                          )
                                                        : '—'}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    <span
                                                        className={
                                                            margin >= 0
                                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                                : 'text-red-600 dark:text-red-400'
                                                        }
                                                    >
                                                        {money(margin)}
                                                    </span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        {percent(rate)}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Décomposition des coûts
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <Line
                                    label="Marchandise"
                                    value={money(arrival.goodsCost)}
                                />
                                <Line
                                    label="Transport / fret"
                                    value={money(arrival.shippingCost)}
                                />
                                <Line
                                    label="Douane"
                                    value={money(arrival.customsCost)}
                                />
                                <Line
                                    label="Divers"
                                    value={money(arrival.otherCost)}
                                />
                                <div className="flex justify-between border-t pt-2 font-semibold">
                                    <span>Total</span>
                                    <span className="tabular-nums">
                                        {money(arrival.totalCost)}
                                    </span>
                                </div>
                                {arrival.currency !== 'XOF' ? (
                                    <p className="pt-1 text-xs text-muted-foreground">
                                        Taux appliqué : 1 {arrival.currency} ={' '}
                                        {arrival.exchangeRate} FCFA
                                    </p>
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
                                    label="Fournisseur"
                                    value={arrival.supplier ?? '—'}
                                />
                                {arrival.supplierPhone ? (
                                    <Line
                                        label="Téléphone"
                                        value={arrival.supplierPhone}
                                    />
                                ) : null}
                                <Line
                                    label="Saisi par"
                                    value={arrival.createdBy ?? '—'}
                                />
                                {arrival.notes ? (
                                    <p className="border-t pt-2 whitespace-pre-line text-muted-foreground">
                                        {arrival.notes}
                                    </p>
                                ) : null}
                            </CardContent>
                        </Card>
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

function ReceiveArrival({
    arrival,
    summary,
}: {
    arrival: Arrival;
    summary: Summary;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button>
                    <CheckCircle2 className="size-4" />
                    Réceptionner
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Réceptionner l'arrivage ?</DialogTitle>
                    <DialogDescription>
                        {count(summary.total_quantity)} articles vont entrer en
                        stock et les prix de revient seront recalculés en
                        moyenne pondérée. Cette opération est définitive :
                        l'arrivage ne pourra plus être modifié.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Annuler</Button>
                    </DialogClose>
                    <Button
                        onClick={() =>
                            router.post(
                                `/arrivages/${arrival.id}/receptionner`,
                                {},
                                { preserveScroll: true },
                            )
                        }
                    >
                        Confirmer la réception
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteArrival({ arrival }: { arrival: Arrival }) {
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
                    <DialogTitle>Supprimer ce brouillon ?</DialogTitle>
                    <DialogDescription>
                        L'arrivage {arrival.reference} et ses lignes seront
                        effacés. Le stock n'est pas concerné.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Annuler</Button>
                    </DialogClose>
                    <Button
                        variant="destructive"
                        onClick={() =>
                            router.delete(`/arrivages/${arrival.id}`)
                        }
                    >
                        Supprimer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

ArrivageShow.layout = {
    breadcrumbs: [
        { title: 'Arrivages', href: '/arrivages' },
        { title: 'Détail', href: '#' },
    ],
};
