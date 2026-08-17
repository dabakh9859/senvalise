import { Link } from '@inertiajs/react';
import { ImageIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import { RESSORT } from '@/components/boutique/mouvement';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

export type ProductCardData = {
    id: number;
    name: string;
    slug: string;
    category: string | null;
    brand: string | null;
    image: string | null;
    price: number;
    priceMax: number;
    compareAt: number | null;
    available: number;
};

/**
 * La carte produit de la vitrine.
 *
 * Pas de cadre, pas d'ombre : l'image porte la carte, le texte se pose
 * dessous. C'est ce qui donne l'aspect « planche de magazine » plutôt que
 * « tableau de bord » — et ce qui laisse les photos respirer côte à côte.
 */
export function ProductCard({
    product,
    delay = 0,
    revele,
    style,
    className,
}: {
    product: ProductCardData;
    /** Retard d'entrée en millisecondes, pour échelonner une rangée. */
    delay?: number;
    /**
     * Apparition au défilement plutôt qu'au chargement.
     *
     * La contrainte d'origine a disparu : la révélation ne s'appuie plus sur
     * une chronologie de défilement, qui s'accrochait au rail horizontal au
     * lieu de la page, mais sur l'observation de l'entrée dans l'écran. Une
     * carte au fond d'un rail se révèle donc correctement, quand on la fait
     * venir. Le drapeau ne sert plus qu'à distinguer ce qui entre au
     * défilement de ce qui doit être là dès le chargement.
     */
    revele?: boolean;
    style?: CSSProperties;
    className?: string;
}) {
    const reduit = useReducedMotion();
    const soldOut = product.available <= 0;
    const discount = product.compareAt
        ? Math.round((1 - product.price / product.compareAt) * 100)
        : 0;

    const depart = { opacity: 0, y: 18 };
    const arrivee = { opacity: 1, y: 0 };
    const transition = { ...RESSORT, delay: delay / 1000 };

    /*
     * Le soulèvement au survol est porté par motion, pas par une transition
     * CSS : le ressort reprend la carte où elle est si la souris repart avant
     * la fin, là où une transition redémarre sa courbe depuis le début et
     * produit ce petit à-coup qu'on voit sur les grilles trop pressées.
     */
    const mouvement = reduit
        ? {}
        : {
              initial: depart,
              ...(revele
                  ? {
                        whileInView: arrivee,
                        viewport: { once: true, margin: '0px 0px -12% 0px' },
                    }
                  : { animate: arrivee }),
              whileHover: { y: -6 },
              transition,
          };

    return (
        <motion.div {...mouvement} style={style} className={className}>
            <Link
                href={`/boutique/produit/${product.slug}`}
                className="group block outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--vitrine-terre)]"
            >
                <div className="relative aspect-[4/5] overflow-hidden bg-[color-mix(in_oklab,var(--vitrine-encre)_7%,transparent)]">
                    {product.image ? (
                        <img
                            src={product.image}
                            alt={product.name}
                            loading="lazy"
                            className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                        />
                    ) : (
                        <span className="flex size-full items-center justify-center text-[var(--vitrine-encre)]/60">
                            <ImageIcon className="size-8" />
                        </span>
                    )}

                    {discount > 0 && !soldOut ? (
                        <span className="vitrine-libelle absolute top-3 left-3 bg-[var(--vitrine-terre)] px-2.5 py-1 text-[11px] text-white tabular-nums">
                            −{discount} %
                        </span>
                    ) : null}

                    {soldOut ? (
                        <span className="vitrine-libelle absolute inset-x-0 bottom-0 bg-[var(--vitrine-encre)]/85 py-2 text-center text-[11px] text-white">
                            Bientôt de retour
                        </span>
                    ) : (
                        /*
                         * Le bandeau monte au survol. Il n'existe qu'à la souris :
                         * au doigt il n'y a pas de survol, et un bandeau
                         * permanent mangerait la photo.
                         */
                        <span className="vitrine-libelle pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-full bg-[var(--vitrine-encre)]/90 py-2.5 text-center text-[11px] text-white opacity-0 transition-[transform,opacity] duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 lg:block">
                            Voir le produit
                        </span>
                    )}
                </div>

                {/*
                 * La marque, le nom, le prix : trois niveaux qui doivent se
                 * distinguer d'un coup d'œil. Le nom est le seul en graisse
                 * pleine, le prix le seul en chiffres tabulaires — alignés d'une
                 * carte à l'autre, ils se comparent en descendant la colonne au
                 * lieu de danser.
                 */}
                <div className="space-y-1 pt-3.5">
                    {product.brand || product.category ? (
                        <p className="vitrine-surtitre text-[10px] text-[var(--vitrine-encre)]/40">
                            {product.brand ?? product.category}
                        </p>
                    ) : null}

                    <p className="text-[15px] leading-snug font-semibold text-balance transition-opacity group-hover:opacity-65">
                        {product.name}
                    </p>

                    <p className="flex items-baseline gap-2 pt-0.5">
                        <span
                            className={cn(
                                'text-sm font-semibold tabular-nums',
                                discount > 0 && 'text-[var(--vitrine-terre)]',
                            )}
                        >
                            {money(product.price)}
                        </span>
                        {product.compareAt ? (
                            <span className="text-xs text-[var(--vitrine-encre)]/40 tabular-nums line-through">
                                {money(product.compareAt)}
                            </span>
                        ) : null}
                    </p>
                </div>
            </Link>
        </motion.div>
    );
}
