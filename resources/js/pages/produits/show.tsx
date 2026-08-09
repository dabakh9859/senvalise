import { Head, Link, router } from '@inertiajs/react';
import {
    Globe,
    GlobeLock,
    Pencil,
    QrCode,
    Trash2,
    Warehouse,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
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
import { count, date, money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';

type Variant = {
    id: number;
    sku: string;
    barcode?: string;
    barcodeReadable?: string;
    barcodeSvg?: string;
    size?: string;
    color?: string;
    dimensions?: string;
    weight_kg?: string;
    capacity_l?: number;
    selling_price: number;
    web_price?: number;
    stock_quantity: number;
    low_stock_threshold: number;
    is_active: boolean;
    cost_price?: number;
    margin_amount?: number;
    margin_rate?: number;
};

type Product = {
    id: number;
    reference: string;
    name: string;
    description: string | null;
    material: string | null;
    warranty_months: number | null;
    category: string | null;
    brand: string | null;
    is_active: boolean;
    is_published: boolean;
    published_at: string | null;
    web_description: string | null;
    created_by: string | null;
    created_at: string | null;
    total_stock: number;
};

type ProductImage = {
    id: number;
    url: string;
    alt: string | null;
    isPrimary: boolean;
};

export default function ProduitShow({
    product,
    variants,
    images,
    canManage,
}: {
    product: Product;
    variants: Variant[];
    images: ProductImage[];
    canManage: boolean;
}) {
    const labelUrl = `/etiquettes?recherche=${encodeURIComponent(product.reference)}`;

    return (
        <>
            <Head title={product.name} />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={product.name}
                    description={
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs">
                                {product.reference}
                            </span>
                            {product.category ? (
                                <span>· {product.category}</span>
                            ) : null}
                            {product.brand ? (
                                <span>· {product.brand}</span>
                            ) : null}
                            {!product.is_active ? (
                                <StatusBadge label="Inactif" tone="neutral" />
                            ) : null}
                            {product.is_published ? (
                                <StatusBadge label="En ligne" tone="info" />
                            ) : null}
                        </span>
                    }
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href={labelUrl}>
                                    <QrCode className="size-4" />
                                    Étiquettes
                                </Link>
                            </Button>

                            {canManage ? (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            router.post(
                                                `/produits/${product.id}/publication`,
                                                {},
                                                { preserveScroll: true },
                                            )
                                        }
                                    >
                                        {product.is_published ? (
                                            <>
                                                <GlobeLock className="size-4" />
                                                Retirer du site
                                            </>
                                        ) : (
                                            <>
                                                <Globe className="size-4" />
                                                Publier
                                            </>
                                        )}
                                    </Button>

                                    <Button asChild>
                                        <Link
                                            href={`/produits/${product.id}/modifier`}
                                        >
                                            <Pencil className="size-4" />
                                            Modifier
                                        </Link>
                                    </Button>

                                    <DeleteProduct product={product} />
                                </>
                            ) : null}
                        </>
                    }
                />

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Warehouse className="size-4" />
                                Stock total
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-semibold tabular-nums">
                                {count(product.total_stock)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                réparti sur {variants.length} déclinaison
                                {variants.length > 1 ? 's' : ''}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-base">
                                Caractéristiques
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                <Row label="Matière" value={product.material} />
                                <Row
                                    label="Garantie"
                                    value={
                                        product.warranty_months
                                            ? `${product.warranty_months} mois`
                                            : null
                                    }
                                />
                                <Row
                                    label="Créé le"
                                    value={date(product.created_at)}
                                />
                                <Row
                                    label="Créé par"
                                    value={product.created_by}
                                />
                                {product.is_published ? (
                                    <Row
                                        label="Publié le"
                                        value={date(product.published_at)}
                                    />
                                ) : null}
                            </dl>

                            {product.description ? (
                                <p className="mt-4 border-t pt-3 text-sm whitespace-pre-line text-muted-foreground">
                                    {product.description}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>

                {images.length > 0 ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Photos</CardTitle>
                            <CardDescription>
                                La photo entourée est celle qui représente le
                                produit sur le site.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
                                {images.map((image) => (
                                    <li
                                        key={image.id}
                                        className={cn(
                                            'aspect-square overflow-hidden rounded-lg border bg-muted',
                                            image.isPrimary &&
                                                'ring-2 ring-primary',
                                        )}
                                    >
                                        <img
                                            src={image.url}
                                            alt={image.alt ?? product.name}
                                            loading="lazy"
                                            className="size-full object-cover"
                                        />
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle>Déclinaisons et codes-barres</CardTitle>
                        <CardDescription>
                            Chaque ligne est un article vendable avec son propre
                            stock.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Déclinaison</TableHead>
                                    <TableHead>Code-barres</TableHead>
                                    <TableHead className="text-right">
                                        Stock
                                    </TableHead>
                                    {canManage ? (
                                        <TableHead className="text-right">
                                            Revient
                                        </TableHead>
                                    ) : null}
                                    <TableHead className="text-right">
                                        Prix de vente
                                    </TableHead>
                                    {canManage ? (
                                        <TableHead className="text-right">
                                            Marge
                                        </TableHead>
                                    ) : null}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {variants.map((variant) => {
                                    const isLow =
                                        variant.stock_quantity <=
                                        variant.low_stock_threshold;

                                    return (
                                        <TableRow key={variant.id}>
                                            <TableCell>
                                                <span className="font-medium">
                                                    {[
                                                        variant.size,
                                                        variant.color,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' / ') ||
                                                        'Standard'}
                                                </span>
                                                <span className="block font-mono text-xs text-muted-foreground">
                                                    {variant.sku}
                                                </span>
                                                {variant.dimensions ||
                                                variant.weight_kg ||
                                                variant.capacity_l ? (
                                                    <span className="block text-xs text-muted-foreground">
                                                        {[
                                                            variant.dimensions,
                                                            variant.weight_kg
                                                                ? `${variant.weight_kg} kg`
                                                                : null,
                                                            variant.capacity_l
                                                                ? `${variant.capacity_l} L`
                                                                : null,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(' · ')}
                                                    </span>
                                                ) : null}
                                                {!variant.is_active ? (
                                                    <StatusBadge
                                                        label="Inactive"
                                                        tone="neutral"
                                                        className="mt-1"
                                                    />
                                                ) : null}
                                            </TableCell>

                                            <TableCell>
                                                {variant.barcodeSvg ? (
                                                    <div className="w-fit">
                                                        <div
                                                            className="text-foreground [&_svg]:h-auto [&_svg]:w-44"
                                                            // Le SVG provient du générateur côté serveur.
                                                            dangerouslySetInnerHTML={{
                                                                __html: variant.barcodeSvg,
                                                            }}
                                                        />
                                                        <span className="block text-center font-mono text-[11px] tracking-wider text-muted-foreground">
                                                            {
                                                                variant.barcodeReadable
                                                            }
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        Aucun
                                                    </span>
                                                )}
                                            </TableCell>

                                            <TableCell className="text-right">
                                                <span
                                                    className={cn(
                                                        'font-medium tabular-nums',
                                                        variant.stock_quantity <=
                                                            0
                                                            ? 'text-red-600 dark:text-red-400'
                                                            : isLow
                                                              ? 'text-amber-600 dark:text-amber-400'
                                                              : '',
                                                    )}
                                                >
                                                    {count(
                                                        variant.stock_quantity,
                                                    )}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    seuil{' '}
                                                    {
                                                        variant.low_stock_threshold
                                                    }
                                                </span>
                                            </TableCell>

                                            {canManage ? (
                                                <TableCell className="text-right text-muted-foreground tabular-nums">
                                                    {money(
                                                        variant.cost_price ?? 0,
                                                    )}
                                                </TableCell>
                                            ) : null}

                                            <TableCell className="text-right font-medium tabular-nums">
                                                {money(variant.selling_price)}
                                                {variant.web_price ? (
                                                    <span className="block text-xs text-muted-foreground">
                                                        site :{' '}
                                                        {money(
                                                            variant.web_price,
                                                        )}
                                                    </span>
                                                ) : null}
                                            </TableCell>

                                            {canManage ? (
                                                <TableCell className="text-right tabular-nums">
                                                    <span className="text-emerald-600 dark:text-emerald-400">
                                                        {money(
                                                            variant.margin_amount ??
                                                                0,
                                                        )}
                                                    </span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        {percent(
                                                            variant.margin_rate ??
                                                                0,
                                                        )}
                                                    </span>
                                                </TableCell>
                                            ) : null}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

function Row({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="flex justify-between gap-4 border-b py-1 last:border-0 sm:border-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value ?? '—'}</dd>
        </div>
    );
}

function DeleteProduct({ product }: { product: Product }) {
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
                    <DialogTitle>Supprimer ce produit ?</DialogTitle>
                    <DialogDescription>
                        « {product.name} » sera retiré du catalogue et de la
                        caisse. Les ventes déjà enregistrées conservent leur
                        libellé et restent intactes.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Annuler</Button>
                    </DialogClose>
                    <Button
                        variant="destructive"
                        onClick={() => router.delete(`/produits/${product.id}`)}
                    >
                        Supprimer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

ProduitShow.layout = {
    breadcrumbs: [
        { title: 'Produits', href: '/produits' },
        { title: 'Fiche produit', href: '#' },
    ],
};
