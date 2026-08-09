import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowRight,
    ImageIcon,
    Minus,
    Plus,
    ShoppingBag,
    TriangleAlert,
    X,
} from 'lucide-react';
import { ShopButton } from '@/components/boutique/vitrine';
import { EmptyState } from '@/components/empty-state';
import { money } from '@/lib/format';

type Line = {
    variantId: number;
    slug: string | null;
    label: string;
    variantLabel: string;
    sku: string;
    image: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    available: number;
    shortage: number;
};

export default function Panier({
    cart,
    zones,
}: {
    cart: { lines: Line[]; subtotal: number; count: number };
    zones: Array<{ id: number; name: string; fee: number; delayLabel: string }>;
}) {
    // La livraison la moins chère, pour annoncer un ordre de grandeur avant
    // que le client n'ait choisi sa zone.
    const cheapest = zones.reduce(
        (min, zone) => Math.min(min, zone.fee),
        zones[0]?.fee ?? 0,
    );

    function setQuantity(variantId: number, quantity: number) {
        router.put(
            '/boutique/panier',
            { variant_id: variantId, quantity },
            { preserveScroll: true },
        );
    }

    return (
        <>
            <Head title="Mon panier" />

            <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
                <h1 className="vitrine-titre mb-8 text-2xl sm:text-3xl">
                    Mon panier
                </h1>

                {cart.lines.length === 0 ? (
                    <div className="border">
                        <EmptyState
                            icon={ShoppingBag}
                            title="Votre panier est vide"
                            description="Parcourez le catalogue et ajoutez la valise qui vous plaît."
                            action={
                                <ShopButton href="/boutique/catalogue">
                                    Voir les valises
                                    <ArrowRight className="size-4" />
                                </ShopButton>
                            }
                        />
                    </div>
                ) : (
                    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                        <ul className="divide-y border">
                            {cart.lines.map((line) => (
                                <li
                                    key={line.variantId}
                                    className="anim-entree flex gap-3 p-3 sm:p-4"
                                >
                                    <Link
                                        href={`/boutique/produit/${line.slug}`}
                                        className="size-24 shrink-0 overflow-hidden bg-muted sm:size-28"
                                    >
                                        {line.image ? (
                                            <img
                                                src={line.image}
                                                alt=""
                                                loading="lazy"
                                                className="size-full object-cover"
                                            />
                                        ) : (
                                            <span className="flex size-full items-center justify-center text-muted-foreground">
                                                <ImageIcon className="size-5" />
                                            </span>
                                        )}
                                    </Link>

                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <Link
                                                    href={`/boutique/produit/${line.slug}`}
                                                    className="line-clamp-2 text-sm font-medium hover:underline"
                                                >
                                                    {line.label}
                                                </Link>
                                                <p className="text-xs text-muted-foreground tabular-nums">
                                                    {money(line.unitPrice)}{' '}
                                                    l’unité
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    router.delete(
                                                        '/boutique/panier',
                                                        {
                                                            data: {
                                                                variant_id:
                                                                    line.variantId,
                                                            },
                                                            preserveScroll: true,
                                                        },
                                                    )
                                                }
                                                className="shrink-0 p-1 text-muted-foreground transition-[color,transform] duration-150 hover:text-destructive active:scale-90"
                                                aria-label="Retirer"
                                            >
                                                <X className="size-4" />
                                            </button>
                                        </div>

                                        {line.shortage > 0 ? (
                                            <p className="flex items-start gap-1.5 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
                                                <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                                                Il ne reste que {line.available}{' '}
                                                en stock.
                                            </p>
                                        ) : null}

                                        <div className="mt-auto flex items-center justify-between gap-3">
                                            <div className="flex items-center border">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setQuantity(
                                                            line.variantId,
                                                            line.quantity - 1,
                                                        )
                                                    }
                                                    className="flex size-10 items-center justify-center transition-[background-color,transform] duration-150 hover:bg-accent active:scale-90"
                                                    aria-label="Retirer un"
                                                >
                                                    <Minus className="size-3.5" />
                                                </button>
                                                <span className="w-8 text-center text-sm font-medium tabular-nums">
                                                    {line.quantity}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setQuantity(
                                                            line.variantId,
                                                            line.quantity + 1,
                                                        )
                                                    }
                                                    className="flex size-10 items-center justify-center transition-[background-color,transform] duration-150 hover:bg-accent active:scale-90"
                                                    aria-label="Ajouter un"
                                                >
                                                    <Plus className="size-3.5" />
                                                </button>
                                            </div>

                                            <span className="text-sm font-semibold tabular-nums">
                                                {money(line.lineTotal)}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        {/* Récapitulatif : collé en bas sur téléphone, il reste
                            sous le pouce pendant qu'on ajuste les quantités. */}
                        <aside className="verre-dense sticky bottom-16 h-fit p-5 lg:top-28 lg:bottom-auto">
                            <p className="vitrine-libelle mb-4 text-xs">
                                Récapitulatif
                            </p>

                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">
                                        Sous-total
                                    </dt>
                                    <dd className="tabular-nums">
                                        {money(cart.subtotal)}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">
                                        Livraison
                                    </dt>
                                    <dd className="text-right text-xs text-muted-foreground">
                                        {zones.length > 0
                                            ? `à partir de ${money(cheapest)}`
                                            : 'calculée à l’étape suivante'}
                                    </dd>
                                </div>
                                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                                    <dt>Total</dt>
                                    <dd className="tabular-nums">
                                        {money(cart.subtotal)}
                                    </dd>
                                </div>
                            </dl>

                            <ShopButton
                                href="/boutique/commande"
                                className="mt-5 w-full"
                            >
                                Commander
                                <ArrowRight className="size-4" />
                            </ShopButton>

                            <Link
                                href="/boutique/catalogue"
                                className="mt-3 block text-center text-sm text-muted-foreground underline underline-offset-4"
                            >
                                Continuer mes achats
                            </Link>
                        </aside>
                    </div>
                )}
            </div>
        </>
    );
}
