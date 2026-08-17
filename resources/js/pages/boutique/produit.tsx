import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ImageIcon,
    Minus,
    PiggyBank,
    Plus,
    ShieldCheck,
    ShoppingBag,
    Truck,
} from 'lucide-react';
import { useState } from 'react';
import { ProductCard } from '@/components/boutique/product-card';
import type { ProductCardData } from '@/components/boutique/product-card';
import { ShopButton } from '@/components/boutique/vitrine';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

type Variant = {
    id: number;
    label: string;
    size: string | null;
    color: string | null;
    sku: string;
    price: number;
    compareAt: number | null;
    available: number;
    dimensions: string | null;
    capacity: number | null;
    weight: string | null;
};

export default function Produit({
    product,
    variants,
    similaires,
}: {
    product: {
        id: number;
        name: string;
        slug: string;
        description: string | null;
        category: string | null;
        brand: string | null;
        material: string | null;
        warrantyMonths: number | null;
        images: Array<{ url: string; alt: string | null }>;
    };
    variants: Variant[];
    similaires: ProductCardData[];
}) {
    // On présélectionne la première déclinaison disponible : demander un choix
    // avant même de montrer un prix ferait fuir.
    const [variantId, setVariantId] = useState(
        () =>
            variants.find((variant) => variant.available > 0)?.id ??
            variants[0]?.id,
    );
    const [quantity, setQuantity] = useState(1);
    const [imageIndex, setImageIndex] = useState(0);

    const variant = variants.find((candidate) => candidate.id === variantId);
    const soldOut = !variant || variant.available <= 0;
    const image = product.images[imageIndex];

    function addToCart() {
        if (!variant) {
            return;
        }

        router.post(
            '/boutique/panier',
            { variant_id: variant.id, quantity },
            { preserveScroll: true },
        );
    }

    return (
        <>
            <Head title={product.name} />

            <div className="mx-auto max-w-[1600px] px-4 py-6 sm:py-10">
                <Link
                    href="/boutique/catalogue"
                    className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--vitrine-encre)]/60 transition-colors hover:text-[var(--vitrine-encre)]"
                >
                    <ArrowLeft className="size-4" />
                    Retour au catalogue
                </Link>

                <div className="grid gap-8 lg:grid-cols-2">
                    {/* -------------------------------------- Photos */}
                    <div className="space-y-3">
                        <div className="anim-fondu aspect-square overflow-hidden bg-[var(--vitrine-sable)]">
                            {image ? (
                                <img
                                    key={image.url}
                                    src={image.url}
                                    alt={image.alt ?? product.name}
                                    className="anim-fondu size-full object-cover"
                                />
                            ) : (
                                <span className="flex size-full items-center justify-center text-[var(--vitrine-encre)]/60">
                                    <ImageIcon className="size-10" />
                                </span>
                            )}
                        </div>

                        {product.images.length > 1 ? (
                            <div className="grid grid-cols-5 gap-2">
                                {product.images.map((photo, index) => (
                                    <button
                                        key={photo.url}
                                        type="button"
                                        onClick={() => setImageIndex(index)}
                                        className={cn(
                                            'aspect-square overflow-hidden bg-[var(--vitrine-sable)] transition-[opacity,outline] duration-150 active:scale-95',
                                            index === imageIndex
                                                ? 'outline outline-2 outline-offset-2 outline-foreground'
                                                : 'opacity-60 hover:opacity-100',
                                        )}
                                    >
                                        <img
                                            src={photo.url}
                                            alt=""
                                            loading="lazy"
                                            className="size-full object-cover"
                                        />
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    {/* -------------------------------------- Achat */}
                    <div className="space-y-5">
                        <div className="space-y-2">
                            {product.brand || product.category ? (
                                <p className="vitrine-surtitre text-[var(--vitrine-encre)]/60">
                                    {[product.brand, product.category]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </p>
                            ) : null}
                            <h1 className="vitrine-titre text-2xl sm:text-4xl">
                                {product.name}
                            </h1>

                            <p className="flex items-baseline gap-3">
                                <span className="text-2xl font-semibold tabular-nums">
                                    {money(variant?.price ?? 0)}
                                </span>
                                {variant?.compareAt &&
                                variant.compareAt > variant.price ? (
                                    <span className="text-base text-[var(--vitrine-encre)]/60 tabular-nums line-through">
                                        {money(variant.compareAt)}
                                    </span>
                                ) : null}
                            </p>
                        </div>

                        {/* Déclinaisons */}
                        {variants.length > 1 ? (
                            <div className="space-y-2">
                                <p className="text-sm font-medium">
                                    Taille et couleur
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {variants.map((candidate) => (
                                        <button
                                            key={candidate.id}
                                            type="button"
                                            disabled={candidate.available <= 0}
                                            onClick={() => {
                                                setVariantId(candidate.id);
                                                setQuantity(1);
                                            }}
                                            className={cn(
                                                'vitrine-libelle border px-4 py-2.5 text-[11px] transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]',
                                                candidate.id === variantId
                                                    ? 'border-[var(--vitrine-encre)] bg-[var(--vitrine-encre)] text-[var(--vitrine-papier)]'
                                                    : 'border-[var(--vitrine-trait)] hover:border-[var(--vitrine-encre)]',
                                                candidate.available <= 0 &&
                                                    'cursor-not-allowed text-[var(--vitrine-encre)]/60 line-through opacity-50',
                                            )}
                                        >
                                            {candidate.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {/* Quantité + ajout */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center border">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setQuantity((q) => Math.max(1, q - 1))
                                    }
                                    className="flex size-12 items-center justify-center transition-[background-color,transform] duration-150 hover:bg-[var(--vitrine-sable)] active:scale-90"
                                    aria-label="Retirer un"
                                >
                                    <Minus className="size-4" />
                                </button>
                                <span className="w-10 text-center font-medium tabular-nums">
                                    {quantity}
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setQuantity((q) =>
                                            Math.min(
                                                variant?.available ?? 1,
                                                q + 1,
                                            ),
                                        )
                                    }
                                    className="flex size-12 items-center justify-center transition-[background-color,transform] duration-150 hover:bg-[var(--vitrine-sable)] active:scale-90"
                                    aria-label="Ajouter un"
                                >
                                    <Plus className="size-4" />
                                </button>
                            </div>

                            <ShopButton
                                onClick={addToCart}
                                disabled={soldOut}
                                className="h-12 flex-1 sm:flex-none sm:px-10"
                            >
                                <ShoppingBag className="size-4" />
                                {soldOut ? 'Indisponible' : 'Ajouter au panier'}
                            </ShopButton>
                        </div>

                        {variant &&
                        variant.available > 0 &&
                        variant.available <= 3 ? (
                            <p className="text-sm text-[var(--vitrine-alerte)]">
                                Plus que {variant.available} en stock.
                            </p>
                        ) : null}

                        {/* Réassurance */}
                        <ul className="grid gap-2 border-y py-4 text-sm">
                            <li className="flex items-center gap-2">
                                <Truck className="size-4 text-[var(--vitrine-encre)]/60" />
                                Livraison partout au Sénégal, payable à la
                                réception.
                            </li>
                            {product.warrantyMonths ? (
                                <li className="flex items-center gap-2">
                                    <ShieldCheck className="size-4 text-[var(--vitrine-encre)]/60" />
                                    Garantie {product.warrantyMonths} mois.
                                </li>
                            ) : null}
                            <li className="flex items-center gap-2">
                                <PiggyBank className="size-4 text-[var(--vitrine-encre)]/60" />
                                <span>
                                    Trop cher d’un coup ?{' '}
                                    <Link
                                        href="/boutique/coffre"
                                        className="font-medium underline underline-offset-4"
                                    >
                                        Ouvrez un coffre
                                    </Link>{' '}
                                    et payez à votre rythme.
                                </span>
                            </li>
                        </ul>

                        {product.description ? (
                            <div className="space-y-2">
                                <p className="text-sm font-medium">
                                    Description
                                </p>
                                <p className="text-sm whitespace-pre-line text-[var(--vitrine-encre)]/60">
                                    {product.description}
                                </p>
                            </div>
                        ) : null}

                        {/* Caractéristiques de la déclinaison choisie */}
                        {variant ? (
                            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                {[
                                    ['Référence', variant.sku],
                                    ['Dimensions', variant.dimensions],
                                    [
                                        'Capacité',
                                        variant.capacity
                                            ? `${variant.capacity} L`
                                            : null,
                                    ],
                                    [
                                        'Poids',
                                        variant.weight
                                            ? `${variant.weight} kg`
                                            : null,
                                    ],
                                    ['Matière', product.material],
                                ]
                                    .filter(([, value]) => Boolean(value))
                                    .map(([label, value]) => (
                                        <div
                                            key={label}
                                            className="flex justify-between gap-3 border-b py-1.5"
                                        >
                                            <dt className="text-[var(--vitrine-encre)]/60">
                                                {label}
                                            </dt>
                                            <dd className="text-right">
                                                {value}
                                            </dd>
                                        </div>
                                    ))}
                            </dl>
                        ) : null}
                    </div>
                </div>

                {similaires.length > 0 ? (
                    <section className="mt-14">
                        <h2 className="vitrine-titre mb-6 text-xl sm:text-2xl">
                            Vous aimerez aussi
                        </h2>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4">
                            {similaires.map((produit, index) => (
                                <ProductCard
                                    key={produit.id}
                                    product={produit}
                                    revele
                                    delay={index * 45}
                                />
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>
        </>
    );
}
