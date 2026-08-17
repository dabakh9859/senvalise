import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowLeftRight,
    ClipboardList,
    Globe,
    Package,
    PackageX,
    Plus,
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
import { amount, count, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IdOption, Paginated } from '@/types';

type VariantRow = {
    id: number;
    label: string;
    sku: string;
    stock: number;
    reserved: number;
    threshold: number;
    isActive: boolean;
};

type ProductRow = {
    id: number;
    reference: string;
    name: string;
    image?: string;
    category: string | null;
    brand: string | null;
    variantCount: number;
    stock: number;
    reserved: number;
    available: number;
    lowCount: number;
    outCount: number;
    isLowStock: boolean;
    priceMin: number;
    priceMax: number;
    is_active: boolean;
    is_published: boolean;
    stockValue?: number;
    variants: VariantRow[];
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

type Filters = {
    recherche?: string;
    categorie?: string;
    marque?: string;
    etat?: string;
    stock?: string;
};

export default function ProduitsIndex({
    products,
    filters,
    categories,
    brands,
    summary,
    reasons,
    canManage,
}: {
    products: Paginated<ProductRow>;
    filters: Filters;
    categories: IdOption[];
    brands: IdOption[];
    summary: Summary;
    reasons: Reason[];
    canManage: boolean;
}) {
    const [adjusting, setAdjusting] = useState<ProductRow | null>(null);
    const { values, set, reset, isFiltered } = useFilters('/produits', {
        recherche: filters.recherche ?? '',
        categorie: filters.categorie ?? '',
        marque: filters.marque ?? '',
        etat: filters.etat ?? '',
        stock: filters.stock ?? '',
    });

    return (
        <>
            <Head title="Produits & stock" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Produits & stock"
                    description="Le catalogue et les quantités sur le même écran : ce qu'on vend et ce qu'il en reste."
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href="/stock/mouvements">
                                    <ArrowLeftRight className="size-4" />
                                    Mouvements
                                </Link>
                            </Button>
                            {canManage ? (
                                <Button asChild variant="outline">
                                    <Link href="/stock/inventaire">
                                        <ClipboardList className="size-4" />
                                        Inventaire
                                    </Link>
                                </Button>
                            ) : null}
                            <Button asChild variant="outline">
                                <Link href="/etiquettes">
                                    <QrCode className="size-4" />
                                    Étiquettes
                                </Link>
                            </Button>
                            {canManage ? (
                                <Button asChild>
                                    <Link href="/produits/nouveau">
                                        <Plus className="size-4" />
                                        Nouveau produit
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
                        icon={Warehouse}
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
                        hint="Plus rien à vendre"
                        icon={PackageX}
                        tone={summary.outOfStock > 0 ? 'danger' : 'default'}
                    />
                    {summary.stockValue !== undefined ? (
                        <StatCard
                            label="Valeur du stock"
                            value={money(summary.stockValue)}
                            hint={`Marge potentielle ${money(summary.potentialMargin ?? 0)}`}
                            tone="info"
                        />
                    ) : (
                        <StatCard
                            label="Déclinaisons"
                            value={count(summary.references)}
                            hint="Tailles et couleurs confondues"
                        />
                    )}
                </div>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Nom, référence, SKU ou code-barres…"
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
                        value={values.marque}
                        onChange={(value) => set('marque', value, true)}
                        options={brands.map((b) => ({
                            value: b.id,
                            label: b.name,
                        }))}
                        allLabel="Toutes marques"
                        width="sm:w-40"
                    />
                    <FilterSelect
                        value={values.stock}
                        onChange={(value) => set('stock', value, true)}
                        options={[
                            { value: 'bas', label: 'Stock bas' },
                            { value: 'rupture', label: 'En rupture' },
                        ]}
                        allLabel="Tout le stock"
                        width="sm:w-36"
                    />
                    <FilterSelect
                        value={values.etat}
                        onChange={(value) => set('etat', value, true)}
                        options={[
                            { value: 'actif', label: 'Actifs' },
                            { value: 'inactif', label: 'Inactifs' },
                            { value: 'publie', label: 'Publiés en ligne' },
                        ]}
                        allLabel="Tous les états"
                        width="sm:w-40"
                    />
                </FilterBar>

                <DataList
                    rows={products.data}
                    getKey={(product) => product.id}
                    tileHref={(product) => `/produits/${product.id}`}
                    columns={[
                        {
                            key: 'produit',
                            header: 'Produit',
                            cell: (product) => (
                                <div className="flex items-center gap-3">
                                    <Vignette product={product} />
                                    <span className="min-w-0">
                                        <Link
                                            href={`/produits/${product.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {product.name}
                                        </Link>
                                        <span className="block text-xs text-muted-foreground">
                                            {product.reference}
                                        </span>
                                    </span>
                                </div>
                            ),
                        },
                        {
                            key: 'categorie',
                            header: 'Catégorie',
                            className: 'text-sm text-muted-foreground',
                            cell: (product) => product.category ?? '—',
                        },
                        {
                            key: 'marque',
                            header: 'Marque',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (product) => product.brand ?? '—',
                        },
                        {
                            key: 'declinaisons',
                            header: 'Déclinaisons',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm',
                            cell: (product) => product.variantCount,
                        },
                        {
                            key: 'stock',
                            header: 'Stock',
                            align: 'right',
                            cell: (product) => (
                                <>
                                    <span className={stockTone(product)}>
                                        {count(product.stock)}
                                    </span>
                                    {product.reserved > 0 ? (
                                        <span className="block text-xs text-muted-foreground">
                                            dont {count(product.reserved)}{' '}
                                            réservé
                                            {product.reserved > 1 ? 's' : ''}
                                        </span>
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'disponible',
                            header: 'Disponible',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm tabular-nums',
                            cell: (product) => count(product.available),
                        },
                        {
                            key: 'alerte',
                            header: 'Alerte',
                            align: 'right',
                            hideBelow: 'xl',
                            className: 'text-sm',
                            cell: (product) => <Alerte product={product} />,
                        },
                        {
                            key: 'prix',
                            header: 'Prix',
                            align: 'right',
                            className: 'text-sm whitespace-nowrap',
                            cell: (product) => priceRange(product),
                        },
                        ...(canManage
                            ? [
                                  {
                                      key: 'valeur',
                                      header: 'Valeur stock',
                                      align: 'right' as const,
                                      hideBelow: 'xl' as const,
                                      className:
                                          'text-sm text-muted-foreground',
                                      cell: (product: ProductRow) =>
                                          money(product.stockValue ?? 0),
                                  },
                              ]
                            : []),
                        {
                            key: 'etat',
                            header: 'État',
                            cell: (product) => (
                                <div className="flex flex-wrap items-center gap-1">
                                    <Etats product={product} />
                                </div>
                            ),
                        },
                        ...(canManage
                            ? [
                                  {
                                      key: 'actions',
                                      header: '',
                                      align: 'right' as const,
                                      cell: (product: ProductRow) => (
                                          <Button
                                              variant="ghost"
                                              size="icon"
                                              aria-label="Ajuster le stock"
                                              title="Ajuster le stock"
                                              onClick={() =>
                                                  setAdjusting(product)
                                              }
                                          >
                                              <SlidersHorizontal className="size-4" />
                                          </Button>
                                      ),
                                  },
                              ]
                            : []),
                    ]}
                    tile={(product) => (
                        <div className="flex items-start gap-3">
                            <Vignette product={product} />
                            <div className="min-w-0 flex-1 space-y-1">
                                <TileHeader
                                    title={product.name}
                                    subtitle={[
                                        product.reference,
                                        product.category,
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    trailing={
                                        <span className="text-sm font-medium tabular-nums">
                                            {priceRange(product)}
                                        </span>
                                    }
                                />
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                        className={cn(
                                            'text-xs tabular-nums',
                                            stockTone(product),
                                        )}
                                    >
                                        {count(product.stock)} en stock
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        · {count(product.variantCount)}{' '}
                                        déclinaison
                                        {product.variantCount > 1 ? 's' : ''}
                                    </span>
                                    <Etats product={product} />
                                </div>
                            </div>
                        </div>
                    )}
                    empty={
                        <EmptyState
                            icon={Package}
                            title="Aucun produit"
                            description={
                                isFiltered
                                    ? 'Aucun produit ne correspond à ces filtres.'
                                    : 'Commencez par créer votre premier produit.'
                            }
                            action={
                                canManage && !isFiltered ? (
                                    <Button asChild size="sm">
                                        <Link href="/produits/nouveau">
                                            <Plus className="size-4" />
                                            Nouveau produit
                                        </Link>
                                    </Button>
                                ) : null
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={products.links}
                            from={products.from}
                            to={products.to}
                            total={products.total}
                            label="produits"
                        />
                    }
                />

                {canManage ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Globe className="size-3.5" />
                        Les produits marqués « En ligne » seront repris
                        automatiquement par le futur site de vente.
                    </p>
                ) : null}
            </div>

            <AjustementDialog
                product={adjusting}
                reasons={reasons}
                onClose={() => setAdjusting(null)}
            />
        </>
    );
}

/** Compteur d'alerte : rien à afficher quand tout va bien. */
function Alerte({ product }: { product: ProductRow }) {
    if (product.outCount > 0) {
        return (
            <span className="text-red-600 dark:text-red-400">
                {product.outCount} en rupture
            </span>
        );
    }

    if (product.lowCount > 0) {
        return (
            <span className="text-amber-600 dark:text-amber-400">
                {product.lowCount} au plus bas
            </span>
        );
    }

    return <span className="text-muted-foreground">—</span>;
}

/**
 * Ajustement manuel du stock.
 *
 * Le stock se tient par déclinaison, pas par produit : une valise en cinq
 * tailles ne se corrige pas d'un seul chiffre. La fenêtre demande donc d'abord
 * laquelle, puis le motif — c'est lui qui donne le sens du mouvement.
 */
function AjustementDialog({
    product,
    reasons,
    onClose,
}: {
    product: ProductRow | null;
    reasons: Reason[];
    onClose: () => void;
}) {
    const [variantId, setVariantId] = useState('');
    const [reason, setReason] = useState(reasons[0]?.value ?? 'correction');
    const [quantity, setQuantity] = useState('1');
    const [note, setNote] = useState('');

    // Un produit à une seule déclinaison n'a rien à faire choisir.
    const variants = product?.variants ?? [];
    const chosen =
        variants.find((variant) => String(variant.id) === variantId) ??
        (variants.length === 1 ? variants[0] : undefined);

    const selected = reasons.find((r) => r.value === reason);
    const delta = Number(quantity || 0);
    const projected = chosen
        ? chosen.stock +
          (selected?.type === 'entree'
              ? delta
              : selected?.type === 'sortie'
                ? -delta
                : 0)
        : 0;

    function close() {
        setVariantId('');
        setQuantity('1');
        setNote('');
        onClose();
    }

    function submit() {
        if (!chosen) {
            return;
        }

        router.post(
            '/stock/ajustement',
            {
                product_variant_id: chosen.id,
                reason,
                quantity: delta,
                note: note || null,
            },
            { preserveScroll: true, onSuccess: close },
        );
    }

    return (
        <Dialog
            open={product !== null}
            onOpenChange={(open) => !open && close()}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ajuster le stock</DialogTitle>
                    <DialogDescription>
                        {product?.name} — {product?.variantCount} déclinaison
                        {(product?.variantCount ?? 0) > 1 ? 's' : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    {variants.length > 1 ? (
                        <div className="grid gap-2">
                            <Label htmlFor="declinaison">Déclinaison</Label>
                            <Select
                                value={variantId}
                                onValueChange={setVariantId}
                            >
                                <SelectTrigger
                                    id="declinaison"
                                    className="w-full"
                                >
                                    <SelectValue placeholder="Choisir la déclinaison" />
                                </SelectTrigger>
                                <SelectContent>
                                    {variants.map((variant) => (
                                        <SelectItem
                                            key={variant.id}
                                            value={String(variant.id)}
                                        >
                                            {variant.label} — {variant.sku} (
                                            {variant.stock})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}

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
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="quantite">Quantité</Label>
                        <Input
                            id="quantite"
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(event) =>
                                setQuantity(event.target.value)
                            }
                        />
                        {chosen ? (
                            <p className="text-xs text-muted-foreground">
                                {chosen.stock} en stock, {projected} après
                                l'ajustement.
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Choisissez d'abord la déclinaison.
                            </p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="note-stock">Note (facultatif)</Label>
                        <Textarea
                            id="note-stock"
                            rows={2}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        onClick={submit}
                        disabled={!chosen || delta < 1}
                    >
                        Enregistrer le mouvement
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Vignette({ product }: { product: ProductRow }) {
    if (product.image) {
        return (
            <img
                src={product.image}
                alt=""
                loading="lazy"
                className="size-10 shrink-0 rounded-md border bg-muted object-cover"
            />
        );
    }

    return (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <Package className="size-4" />
        </span>
    );
}

/** Les pastilles d'état, identiques sur la tuile et dans le tableau. */
function Etats({ product }: { product: ProductRow }) {
    return (
        <>
            {product.is_active ? null : (
                <StatusBadge label="Inactif" tone="neutral" />
            )}
            {product.is_published ? (
                <StatusBadge label="En ligne" tone="info" />
            ) : null}
            {product.stock <= 0 ? (
                <StatusBadge label="Rupture" tone="danger" />
            ) : product.isLowStock ? (
                <StatusBadge label="Stock bas" tone="warning" />
            ) : null}
        </>
    );
}

function stockTone(product: ProductRow): string {
    if (product.stock <= 0) {
        return 'font-medium text-red-600 dark:text-red-400';
    }

    return product.isLowStock
        ? 'font-medium text-amber-600 dark:text-amber-400'
        : 'font-medium';
}

function priceRange(product: ProductRow): string {
    return product.priceMin === product.priceMax
        ? money(product.priceMin)
        : `${amount(product.priceMin)} – ${money(product.priceMax)}`;
}

ProduitsIndex.layout = {
    breadcrumbs: [{ title: 'Produits & stock', href: '/produits' }],
};
