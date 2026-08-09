import { Head, Link } from '@inertiajs/react';
import { Globe, Package, Plus, QrCode } from 'lucide-react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useFilters } from '@/hooks/use-filters';
import { amount, count, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IdOption, Paginated } from '@/types';

type ProductRow = {
    id: number;
    reference: string;
    name: string;
    image?: string;
    category: string | null;
    brand: string | null;
    variantCount: number;
    stock: number;
    isLowStock: boolean;
    priceMin: number;
    priceMax: number;
    is_active: boolean;
    is_published: boolean;
    stockValue?: number;
};

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
    canManage,
}: {
    products: Paginated<ProductRow>;
    filters: Filters;
    categories: IdOption[];
    brands: IdOption[];
    canManage: boolean;
}) {
    const { values, set, reset, isFiltered } = useFilters('/produits', {
        recherche: filters.recherche ?? '',
        categorie: filters.categorie ?? '',
        marque: filters.marque ?? '',
        etat: filters.etat ?? '',
        stock: filters.stock ?? '',
    });

    return (
        <>
            <Head title="Produits" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Produits"
                    description="Catalogue des valises, bagages et accessoires."
                    actions={
                        <>
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
                                <span className={stockTone(product)}>
                                    {count(product.stock)}
                                </span>
                            ),
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
                                      className: 'text-sm text-muted-foreground',
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
                                        ·{' '}
                                        {count(product.variantCount)}{' '}
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
        </>
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
    breadcrumbs: [{ title: 'Produits', href: '/produits' }],
};
