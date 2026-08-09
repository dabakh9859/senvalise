import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    ClipboardList,
    History,
    Layers,
    PackageX,
    QrCode,
    SlidersHorizontal,
    Warehouse,
} from 'lucide-react';
import { useState } from 'react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
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
import { Textarea } from '@/components/ui/textarea';
import { useFilters } from '@/hooks/use-filters';
import { count, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IdOption, Paginated } from '@/types';

type StockRow = {
    id: number;
    productId: number;
    label: string;
    sku: string;
    barcode?: string;
    category?: string;
    stock: number;
    reserved: number;
    available: number;
    threshold: number;
    isLow: boolean;
    sellingPrice: number;
    isActive: boolean;
    costPrice?: number;
    stockValue?: number;
};

type Summary = {
    references: number;
    articles: number;
    lowStock: number;
    outOfStock: number;
    stockValue?: number;
    retailValue?: number;
    potentialMargin?: number;
};

type Reason = { value: string; label: string; type: string };

export default function StockIndex({
    variants,
    filters,
    categories,
    summary,
    reasons,
    canManage,
}: {
    variants: Paginated<StockRow>;
    filters: Record<string, string | undefined>;
    categories: IdOption[];
    summary: Summary;
    reasons: Reason[];
    canManage: boolean;
}) {
    const { values, set, reset, isFiltered } = useFilters('/stock', {
        recherche: filters.recherche ?? '',
        categorie: filters.categorie ?? '',
        etat: filters.etat ?? '',
    });

    const [adjusting, setAdjusting] = useState<StockRow | null>(null);

    return (
        <>
            <Head title="Stock" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Stock"
                    description="État des quantités disponibles, article par article."
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href="/etiquettes">
                                    <QrCode className="size-4" />
                                    Étiquettes
                                </Link>
                            </Button>
                            <Button asChild variant="outline">
                                <Link href="/stock/mouvements">
                                    <History className="size-4" />
                                    Historique
                                </Link>
                            </Button>
                            {canManage ? (
                                <Button asChild>
                                    <Link href="/stock/inventaire">
                                        <ClipboardList className="size-4" />
                                        Faire l'inventaire
                                    </Link>
                                </Button>
                            ) : null}
                        </>
                    }
                />

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="Références actives"
                        value={count(summary.references)}
                        hint={`${count(summary.articles)} articles en rayon`}
                        icon={Layers}
                    />
                    <StatCard
                        label="Stock bas"
                        value={count(summary.lowStock)}
                        hint="Sous le seuil d'alerte"
                        icon={AlertTriangle}
                        tone={summary.lowStock > 0 ? 'warning' : 'default'}
                    />
                    <StatCard
                        label="En rupture"
                        value={count(summary.outOfStock)}
                        hint="À réapprovisionner"
                        icon={PackageX}
                        tone={summary.outOfStock > 0 ? 'danger' : 'default'}
                    />
                    {summary.stockValue !== undefined ? (
                        <StatCard
                            label="Valeur du stock"
                            value={money(summary.stockValue)}
                            hint={`Marge potentielle ${money(summary.potentialMargin ?? 0)}`}
                            icon={Warehouse}
                        />
                    ) : null}
                </div>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Nom, SKU ou code-barres…"
                    onReset={reset}
                    isFiltered={isFiltered}
                >
                    <FilterSelect
                        value={values.categorie}
                        onChange={(value) => set('categorie', value, true)}
                        options={categories.map((c) => ({
                            value: c.id,
                            label: c.name,
                        }))}
                        allLabel="Toutes catégories"
                    />
                    <FilterSelect
                        value={values.etat}
                        onChange={(value) => set('etat', value, true)}
                        options={[
                            { value: 'disponible', label: 'Disponibles' },
                            { value: 'bas', label: 'Stock bas' },
                            { value: 'rupture', label: 'En rupture' },
                            { value: 'inactif', label: 'Inactifs' },
                        ]}
                        allLabel="Tous les états"
                        width="sm:w-40"
                    />
                </FilterBar>

                <DataList
                    rows={variants.data}
                    getKey={(row) => row.id}
                    columns={[
                        {
                            key: 'article',
                            header: 'Article',
                            cell: (row) => (
                                <>
                                    <Link
                                        href={`/produits/${row.productId}`}
                                        className="font-medium hover:underline"
                                    >
                                        {row.label}
                                    </Link>
                                    <span className="block font-mono text-xs text-muted-foreground">
                                        {row.sku}
                                        {row.barcode ? ` · ${row.barcode}` : ''}
                                    </span>
                                </>
                            ),
                        },
                        {
                            key: 'categorie',
                            header: 'Catégorie',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (row) => row.category ?? '—',
                        },
                        {
                            key: 'stock',
                            header: 'Stock',
                            align: 'right',
                            cell: (row) => (
                                <>
                                    <span
                                        className={cn(
                                            'text-base font-semibold',
                                            stockTone(row),
                                        )}
                                    >
                                        {count(row.stock)}
                                    </span>
                                    {row.reserved > 0 ? (
                                        <span className="block text-xs text-muted-foreground">
                                            dont {row.reserved} réservé
                                            {row.reserved > 1 ? 's' : ''}
                                        </span>
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'seuil',
                            header: 'Seuil',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (row) => row.threshold,
                        },
                        {
                            key: 'prix',
                            header: 'Prix de vente',
                            align: 'right',
                            className: 'text-sm',
                            cell: (row) => money(row.sellingPrice),
                        },
                        ...(canManage
                            ? [
                                  {
                                      key: 'valeur',
                                      header: 'Valeur',
                                      align: 'right' as const,
                                      hideBelow: 'xl' as const,
                                      className: 'text-sm text-muted-foreground',
                                      cell: (row: StockRow) =>
                                          money(row.stockValue ?? 0),
                                  },
                              ]
                            : []),
                        {
                            key: 'etat',
                            header: 'État',
                            cell: (row) => <EtatStock row={row} />,
                        },
                        ...(canManage
                            ? [
                                  {
                                      key: 'ajuster',
                                      header: '',
                                      headClassName: 'w-10',
                                      cell: (row: StockRow) => (
                                          <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => setAdjusting(row)}
                                              aria-label="Ajuster le stock"
                                          >
                                              <SlidersHorizontal className="size-4" />
                                          </Button>
                                      ),
                                  },
                              ]
                            : []),
                    ]}
                    tile={(row) => (
                        <div className="space-y-2">
                            <TileHeader
                                title={row.label}
                                subtitle={`${row.sku}${row.category ? ` · ${row.category}` : ''}`}
                                trailing={
                                    <>
                                        <span
                                            className={cn(
                                                'block text-base font-semibold tabular-nums',
                                                stockTone(row),
                                            )}
                                        >
                                            {count(row.stock)}
                                        </span>
                                        <span className="block text-xs text-muted-foreground tabular-nums">
                                            seuil {row.threshold}
                                        </span>
                                    </>
                                }
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex items-center gap-2">
                                    <EtatStock row={row} />
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {money(row.sellingPrice)}
                                    </span>
                                </span>
                                {canManage ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setAdjusting(row)}
                                    >
                                        <SlidersHorizontal className="size-4" />
                                        Ajuster
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    )}
                    empty={
                        <EmptyState
                            icon={Layers}
                            title="Aucun article"
                            description={
                                isFiltered
                                    ? 'Aucun article ne correspond à ces filtres.'
                                    : 'Le stock se remplit dès que vous créez des produits.'
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={variants.links}
                            from={variants.from}
                            to={variants.to}
                            total={variants.total}
                            label="articles"
                        />
                    }
                />
            </div>

            <AdjustDialog
                row={adjusting}
                reasons={reasons}
                onClose={() => setAdjusting(null)}
            />
        </>
    );
}

/** Ajustement manuel : le motif choisi donne le sens du mouvement. */
function AdjustDialog({
    row,
    reasons,
    onClose,
}: {
    row: StockRow | null;
    reasons: Reason[];
    onClose: () => void;
}) {
    const [reason, setReason] = useState(reasons[0]?.value ?? 'correction');
    const [quantity, setQuantity] = useState('1');
    const [note, setNote] = useState('');

    const selected = reasons.find((r) => r.value === reason);
    const isEntry = selected?.type === 'entree';
    const delta = Number(quantity || 0);
    const projected = row
        ? row.stock +
          (isEntry ? delta : selected?.type === 'sortie' ? -delta : 0)
        : 0;

    function submit() {
        if (!row) {
            return;
        }

        router.post(
            '/stock/ajustement',
            {
                product_variant_id: row.id,
                reason,
                quantity: delta,
                note: note || null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setQuantity('1');
                    setNote('');
                    onClose();
                },
            },
        );
    }

    return (
        <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ajuster le stock</DialogTitle>
                    <DialogDescription>
                        {row?.label} — stock actuel : {row?.stock}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="motif">Motif</Label>
                        <Select value={reason} onValueChange={setReason}>
                            <SelectTrigger id="motif" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {reasons.map((option) => (
                                    <SelectItem
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                        {option.type === 'entree'
                                            ? ' (entrée)'
                                            : option.type === 'sortie'
                                              ? ' (sortie)'
                                              : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="quantite">Quantité</Label>
                        <Input
                            id="quantite"
                            value={quantity}
                            onChange={(event) =>
                                setQuantity(
                                    event.target.value.replace(/\D/g, ''),
                                )
                            }
                            inputMode="numeric"
                            className="tabular-nums"
                        />
                        {selected?.type !== 'ajustement' && delta > 0 ? (
                            <p className="text-xs text-muted-foreground">
                                Nouveau stock après l'opération :{' '}
                                <span
                                    className={cn(
                                        'font-medium tabular-nums',
                                        projected < 0
                                            ? 'text-red-600 dark:text-red-400'
                                            : '',
                                    )}
                                >
                                    {projected}
                                </span>
                            </p>
                        ) : null}
                        {selected?.type === 'ajustement' ? (
                            <p className="text-xs text-muted-foreground">
                                Pour un recomptage complet, préférez l'écran
                                Inventaire.
                            </p>
                        ) : null}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="note">Note (facultatif)</Label>
                        <Textarea
                            id="note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={2}
                            placeholder="Précision utile pour retrouver l'opération plus tard…"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button onClick={submit} disabled={delta <= 0}>
                        Enregistrer le mouvement
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Le chiffre du stock : rouge en rupture, ambre sous le seuil. */
function stockTone(row: StockRow): string {
    if (row.stock <= 0) {
        return 'text-red-600 dark:text-red-400';
    }

    return row.isLow ? 'text-amber-600 dark:text-amber-400' : '';
}

/** La pastille d'état, identique dans le tableau et sur la tuile. */
function EtatStock({ row }: { row: StockRow }) {
    if (!row.isActive) {
        return <StatusBadge label="Inactif" tone="neutral" />;
    }

    if (row.stock <= 0) {
        return <StatusBadge label="Rupture" tone="danger" />;
    }

    if (row.isLow) {
        return <StatusBadge label="Stock bas" tone="warning" />;
    }

    return <StatusBadge label="Disponible" tone="success" />;
}


StockIndex.layout = {
    breadcrumbs: [{ title: 'Stock', href: '/stock' }],
};
