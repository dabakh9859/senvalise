import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ChevronDown,
    Globe,
    Loader2,
    Plus,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { RemoteImage } from '@/components/image-search-dialog';
import { ImageUploader } from '@/components/image-uploader';
import type { ExistingImage } from '@/components/image-uploader';
import InputError from '@/components/input-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { money, parseAmount } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IdOption } from '@/types';

type VariantForm = {
    id?: number;
    sku?: string;
    barcode: string;
    size: string;
    color: string;
    dimensions: string;
    weight_kg: string;
    capacity_l: string;
    cost_price: string;
    selling_price: string;
    web_price: string;
    compare_at_price: string;
    low_stock_threshold: string;
    is_active: boolean;
    stock_quantity?: number;
};

type ProductForm = {
    id?: number;
    reference?: string;
    name: string;
    description: string;
    category_id: string;
    brand_id: string;
    material: string;
    warranty_months: string;
    is_active: boolean;
    is_published: boolean;
    web_description: string;
    meta_title: string;
    meta_description: string;
    variants?: Array<Record<string, unknown>>;
};

const NONE = '__aucune__';

function emptyVariant(threshold: number): VariantForm {
    return {
        barcode: '',
        size: '',
        color: '',
        dimensions: '',
        weight_kg: '',
        capacity_l: '',
        cost_price: '',
        selling_price: '',
        web_price: '',
        compare_at_price: '',
        low_stock_threshold: String(threshold),
        is_active: true,
    };
}

export default function ProduitForm({
    product,
    images,
    reference,
    categories,
    brands,
    defaultThreshold,
    imageSearchEnabled,
}: {
    product: ProductForm | null;
    images: ExistingImage[];
    reference: string;
    categories: IdOption[];
    brands: IdOption[];
    defaultThreshold: number;
    imageSearchEnabled: boolean;
}) {
    const isEdit = Boolean(product?.id);

    const [newImages, setNewImages] = useState<File[]>([]);
    const [remoteImages, setRemoteImages] = useState<RemoteImage[]>([]);
    const [deletedImages, setDeletedImages] = useState<number[]>([]);
    const [primaryImage, setPrimaryImage] = useState<number | null>(null);

    const [form, setForm] = useState({
        name: product?.name ?? '',
        description: product?.description ?? '',
        category_id: product?.category_id ? String(product.category_id) : NONE,
        brand_id: product?.brand_id ? String(product.brand_id) : NONE,
        material: product?.material ?? '',
        warranty_months: product?.warranty_months
            ? String(product.warranty_months)
            : '',
        is_active: product?.is_active ?? true,
        is_published: product?.is_published ?? false,
        web_description: product?.web_description ?? '',
        meta_title: product?.meta_title ?? '',
        meta_description: product?.meta_description ?? '',
    });

    const [variants, setVariants] = useState<VariantForm[]>(() => {
        const existing = (product?.variants ?? []) as Array<
            Record<string, unknown>
        >;

        if (existing.length === 0) {
            return [emptyVariant(defaultThreshold)];
        }

        return existing.map((v) => ({
            id: v.id as number,
            sku: v.sku as string,
            barcode: (v.barcode as string) ?? '',
            size: (v.size as string) ?? '',
            color: (v.color as string) ?? '',
            dimensions: (v.dimensions as string) ?? '',
            weight_kg: v.weight_kg ? String(v.weight_kg) : '',
            capacity_l: v.capacity_l ? String(v.capacity_l) : '',
            cost_price: v.cost_price ? String(v.cost_price) : '',
            selling_price: v.selling_price ? String(v.selling_price) : '',
            web_price: v.web_price ? String(v.web_price) : '',
            compare_at_price: v.compare_at_price
                ? String(v.compare_at_price)
                : '',
            low_stock_threshold: String(
                v.low_stock_threshold ?? defaultThreshold,
            ),
            is_active: (v.is_active as boolean) ?? true,
            stock_quantity: v.stock_quantity as number,
        }));
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);

    function updateVariant(index: number, patch: Partial<VariantForm>) {
        setVariants((current) =>
            current.map((variant, i) =>
                i === index ? { ...variant, ...patch } : variant,
            ),
        );
    }

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setProcessing(true);

        const payload = {
            ...form,
            category_id:
                form.category_id === NONE ? null : Number(form.category_id),
            brand_id: form.brand_id === NONE ? null : Number(form.brand_id),
            warranty_months: form.warranty_months
                ? Number(form.warranty_months)
                : null,
            variants: variants.map((variant) => ({
                id: variant.id ?? null,
                barcode: variant.barcode || null,
                size: variant.size || null,
                color: variant.color || null,
                dimensions: variant.dimensions || null,
                weight_kg: variant.weight_kg ? Number(variant.weight_kg) : null,
                capacity_l: variant.capacity_l
                    ? Number(variant.capacity_l)
                    : null,
                cost_price: parseAmount(variant.cost_price),
                selling_price: parseAmount(variant.selling_price),
                web_price: variant.web_price
                    ? parseAmount(variant.web_price)
                    : null,
                compare_at_price: variant.compare_at_price
                    ? parseAmount(variant.compare_at_price)
                    : null,
                low_stock_threshold: Number(variant.low_stock_threshold || 0),
                is_active: variant.is_active,
            })),
            images: newImages,
            image_urls: remoteImages.map((image) => image.url),
            deleted_images: deletedImages,
            primary_image: primaryImage,
        };

        const options = {
            onError: (received: Record<string, string>) => setErrors(received),
            onFinish: () => setProcessing(false),
        };

        if (isEdit) {
            // Les fichiers imposent un envoi multipart, que PUT ne sait pas
            // porter : on poste en simulant la méthode.
            router.post(
                `/produits/${product?.id}`,
                { ...payload, _method: 'put' },
                options,
            );
        } else {
            router.post('/produits', payload, options);
        }
    }

    return (
        <>
            <Head
                title={isEdit ? `Modifier ${product?.name}` : 'Nouveau produit'}
            />

            <form onSubmit={submit} className="flex flex-1 flex-col gap-5 p-4">
                <PageHeader
                    title={isEdit ? 'Modifier le produit' : 'Nouveau produit'}
                    description={`Référence ${reference}`}
                    actions={
                        <>
                            <Button asChild variant="outline" type="button">
                                <Link
                                    href={
                                        isEdit
                                            ? `/produits/${product?.id}`
                                            : '/produits'
                                    }
                                >
                                    <ArrowLeft className="size-4" />
                                    Annuler
                                </Link>
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {processing ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Enregistrer
                            </Button>
                        </>
                    }
                />

                {/* 1. Le produit */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Le produit</CardTitle>
                    </CardHeader>
                    <CardContent className="grid max-w-3xl gap-4 sm:grid-cols-2">
                        <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="name">Nom du produit</Label>
                            <Input
                                id="name"
                                value={form.name}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        name: event.target.value,
                                    })
                                }
                                placeholder="Valise rigide 4 roues ABS"
                                required
                            />
                            <InputError message={errors.name} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="category">Catégorie</Label>
                            <Select
                                value={form.category_id}
                                onValueChange={(value) =>
                                    setForm({ ...form, category_id: value })
                                }
                            >
                                <SelectTrigger id="category" className="w-full">
                                    <SelectValue placeholder="Choisir…" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>
                                        Sans catégorie
                                    </SelectItem>
                                    {categories.map((category) => (
                                        <SelectItem
                                            key={category.id}
                                            value={String(category.id)}
                                        >
                                            {category.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="brand">Marque</Label>
                            <Select
                                value={form.brand_id}
                                onValueChange={(value) =>
                                    setForm({ ...form, brand_id: value })
                                }
                            >
                                <SelectTrigger id="brand" className="w-full">
                                    <SelectValue placeholder="Choisir…" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>
                                        Sans marque
                                    </SelectItem>
                                    {brands.map((brand) => (
                                        <SelectItem
                                            key={brand.id}
                                            value={String(brand.id)}
                                        >
                                            {brand.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="material">Matière</Label>
                            <Input
                                id="material"
                                value={form.material}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        material: event.target.value,
                                    })
                                }
                                placeholder="Polycarbonate, ABS…"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="warranty">Garantie (mois)</Label>
                            <Input
                                id="warranty"
                                value={form.warranty_months}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        warranty_months:
                                            event.target.value.replace(
                                                /\D/g,
                                                '',
                                            ),
                                    })
                                }
                                placeholder="12"
                                inputMode="numeric"
                            />
                        </div>

                        <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={form.description}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        description: event.target.value,
                                    })
                                }
                                rows={2}
                            />
                        </div>

                        <label className="flex items-center gap-2 text-sm sm:col-span-2">
                            <Checkbox
                                checked={form.is_active}
                                onCheckedChange={(checked) =>
                                    setForm({
                                        ...form,
                                        is_active: checked === true,
                                    })
                                }
                            />
                            En vente (visible en caisse)
                        </label>
                    </CardContent>
                </Card>

                {/* 2. Tailles et couleurs */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            Tailles et couleurs
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Une ligne par article vendable. Chacun aura son
                            propre stock et son code-barres, créé
                            automatiquement.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <InputError message={errors.variants} />

                        {variants.map((variant, index) => (
                            <VariantRow
                                key={variant.id ?? `new-${index}`}
                                variant={variant}
                                index={index}
                                errors={errors}
                                canRemove={variants.length > 1}
                                onChange={(patch) =>
                                    updateVariant(index, patch)
                                }
                                onRemove={() =>
                                    setVariants((current) =>
                                        current.filter((_, i) => i !== index),
                                    )
                                }
                            />
                        ))}

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                setVariants((current) => [
                                    ...current,
                                    emptyVariant(defaultThreshold),
                                ])
                            }
                        >
                            <Plus className="size-4" />
                            Ajouter une taille ou une couleur
                        </Button>
                    </CardContent>
                </Card>

                {/* 3. Boutique en ligne — replié, on n'y touche qu'au moment de publier */}
                <Collapsible>
                    <Card>
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="group flex w-full items-center justify-between gap-3 rounded-xl px-6 py-1 text-left transition-colors hover:bg-accent/40"
                            >
                                <span className="flex items-center gap-2">
                                    <Globe className="size-4 text-muted-foreground" />
                                    <span className="font-semibold">
                                        Boutique en ligne
                                    </span>
                                    {form.is_published ? (
                                        <span className="rounded-md bg-blue-500/12 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                                            Publié
                                        </span>
                                    ) : null}
                                </span>
                                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                            </button>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                            <CardContent className="grid max-w-3xl gap-5 pt-4">
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={form.is_published}
                                        onCheckedChange={(checked) =>
                                            setForm({
                                                ...form,
                                                is_published: checked === true,
                                            })
                                        }
                                    />
                                    Publier ce produit sur le site
                                </label>

                                <div className="grid gap-2">
                                    <Label>Photos du produit</Label>
                                    <ImageUploader
                                        existing={images}
                                        files={newImages}
                                        onFilesChange={setNewImages}
                                        deletedIds={deletedImages}
                                        onDeletedChange={setDeletedImages}
                                        primaryId={primaryImage}
                                        onPrimaryChange={setPrimaryImage}
                                        remote={remoteImages}
                                        onRemoteChange={setRemoteImages}
                                        productName={form.name}
                                        searchEnabled={imageSearchEnabled}
                                    />
                                    <InputError message={errors.images} />
                                    <InputError message={errors['images.0']} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="web_description">
                                        Description commerciale
                                    </Label>
                                    <Textarea
                                        id="web_description"
                                        value={form.web_description}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                web_description:
                                                    event.target.value,
                                            })
                                        }
                                        rows={3}
                                        placeholder="Texte affiché sur la fiche produit du site…"
                                    />
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="meta_title">
                                            Titre référencement
                                        </Label>
                                        <Input
                                            id="meta_title"
                                            value={form.meta_title}
                                            onChange={(event) =>
                                                setForm({
                                                    ...form,
                                                    meta_title:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="meta_description">
                                            Description référencement
                                        </Label>
                                        <Input
                                            id="meta_description"
                                            value={form.meta_description}
                                            onChange={(event) =>
                                                setForm({
                                                    ...form,
                                                    meta_description:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            </form>
        </>
    );
}

/**
 * Une ligne = un article vendable.
 *
 * Quatre champs suffisent au quotidien ; tout le reste (dimensions, poids,
 * code-barres, prix du site) est replié pour ne pas noyer l'écran.
 */
function VariantRow({
    variant,
    index,
    errors,
    canRemove,
    onChange,
    onRemove,
}: {
    variant: VariantForm;
    index: number;
    errors: Record<string, string>;
    canRemove: boolean;
    onChange: (patch: Partial<VariantForm>) => void;
    onRemove: () => void;
}) {
    const [open, setOpen] = useState(false);

    const margin =
        parseAmount(variant.selling_price) - parseAmount(variant.cost_price);

    return (
        <div
            className={cn(
                'rounded-lg border p-3',
                variant.is_active ? '' : 'bg-muted/40 opacity-70',
            )}
        >
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                <div className="grid gap-1.5">
                    <Label className="text-xs">Taille</Label>
                    <Input
                        value={variant.size}
                        onChange={(event) =>
                            onChange({ size: event.target.value })
                        }
                        placeholder="Cabine 55cm"
                        className="h-9"
                    />
                </div>

                <div className="grid gap-1.5">
                    <Label className="text-xs">Couleur</Label>
                    <Input
                        value={variant.color}
                        onChange={(event) =>
                            onChange({ color: event.target.value })
                        }
                        placeholder="Noir"
                        className="h-9"
                    />
                </div>

                {!variant.id ? (
                    <div className="grid gap-1.5">
                        <Label className="text-xs">Prix d'achat</Label>
                        <Input
                            value={variant.cost_price}
                            onChange={(event) =>
                                onChange({ cost_price: event.target.value })
                            }
                            placeholder="24 000"
                            inputMode="numeric"
                            className="h-9 w-32 text-right tabular-nums"
                        />
                    </div>
                ) : null}

                <div className="grid gap-1.5">
                    <Label className="text-xs">Prix de vente</Label>
                    <Input
                        value={variant.selling_price}
                        onChange={(event) =>
                            onChange({ selling_price: event.target.value })
                        }
                        placeholder="42 000"
                        inputMode="numeric"
                        required
                        className="h-9 w-32 text-right tabular-nums"
                    />
                    <InputError
                        message={errors[`variants.${index}.selling_price`]}
                    />
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                    <ChevronDown
                        className={cn(
                            'size-3.5 transition-transform',
                            open && 'rotate-180',
                        )}
                    />
                    {open ? 'Moins de détails' : 'Plus de détails'}
                </button>

                {variant.sku ? (
                    <span className="font-mono text-muted-foreground">
                        {variant.sku}
                    </span>
                ) : null}

                {!variant.id && margin > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                        marge {money(margin)}
                    </span>
                ) : null}

                {variant.id !== undefined ? (
                    <span className="text-muted-foreground">
                        stock : {variant.stock_quantity ?? 0}
                    </span>
                ) : null}

                {canRemove ? (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-destructive"
                    >
                        <Trash2 className="size-3.5" />
                        Retirer
                    </button>
                ) : null}
            </div>

            {open ? (
                <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
                    <div className="grid gap-1.5">
                        <Label className="text-xs">Dimensions</Label>
                        <Input
                            value={variant.dimensions}
                            onChange={(event) =>
                                onChange({ dimensions: event.target.value })
                            }
                            placeholder="55 x 38 x 22 cm"
                            className="h-8"
                        />
                    </div>

                    <div className="grid gap-1.5">
                        <Label className="text-xs">Poids (kg)</Label>
                        <Input
                            value={variant.weight_kg}
                            onChange={(event) =>
                                onChange({ weight_kg: event.target.value })
                            }
                            placeholder="2.9"
                            inputMode="decimal"
                            className="h-8"
                        />
                    </div>

                    <div className="grid gap-1.5">
                        <Label className="text-xs">Volume (litres)</Label>
                        <Input
                            value={variant.capacity_l}
                            onChange={(event) =>
                                onChange({
                                    capacity_l: event.target.value.replace(
                                        /\D/g,
                                        '',
                                    ),
                                })
                            }
                            placeholder="38"
                            inputMode="numeric"
                            className="h-8"
                        />
                    </div>

                    <div className="grid gap-1.5">
                        <Label className="text-xs">
                            Alerte quand il reste…
                        </Label>
                        <Input
                            value={variant.low_stock_threshold}
                            onChange={(event) =>
                                onChange({
                                    low_stock_threshold:
                                        event.target.value.replace(/\D/g, ''),
                                })
                            }
                            inputMode="numeric"
                            className="h-8 text-right tabular-nums"
                        />
                    </div>

                    <div className="grid gap-1.5">
                        <Label className="text-xs">Prix du site</Label>
                        <Input
                            value={variant.web_price}
                            onChange={(event) =>
                                onChange({ web_price: event.target.value })
                            }
                            placeholder="si différent"
                            inputMode="numeric"
                            className="h-8 text-right tabular-nums"
                        />
                    </div>

                    <div className="grid gap-1.5">
                        <Label className="text-xs">Code-barres</Label>
                        <Input
                            value={variant.barcode}
                            onChange={(event) =>
                                onChange({ barcode: event.target.value })
                            }
                            placeholder="créé automatiquement"
                            className="h-8 font-mono text-sm"
                        />
                    </div>

                    <label className="flex items-center gap-2 text-sm sm:col-span-3">
                        <Checkbox
                            checked={variant.is_active}
                            onCheckedChange={(checked) =>
                                onChange({ is_active: checked === true })
                            }
                        />
                        En vente
                    </label>
                </div>
            ) : null}
        </div>
    );
}

ProduitForm.layout = {
    breadcrumbs: [
        { title: 'Produits', href: '/produits' },
        { title: 'Formulaire', href: '#' },
    ],
};
