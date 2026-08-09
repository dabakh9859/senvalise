import { Link } from '@inertiajs/react';
import { ArrowRight, ImageIcon, Info } from 'lucide-react';
import { useState } from 'react';
import type { ProductCardData } from '@/components/boutique/product-card';
import { ShopButton } from '@/components/boutique/vitrine';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

export type HeroBlock = {
    id: number;
    title: string | null;
    subtitle: string | null;
    body: string | null;
    image: string | null;
    linkUrl: string | null;
    linkLabel: string | null;
};

export type Vedette = ProductCardData & {
    tagline: string;
    specs: string[];
};

/** Où se pose chaque caractéristique autour de la photo. */
const COINS = [
    'top-4 left-4',
    'top-4 right-4',
    'bottom-4 left-4',
    'bottom-4 right-4',
];

/**
 * Le héros.
 *
 * À gauche l'accroche, à droite la vitrine : une valise posée sur un panneau
 * de verre, entourée de ses vraies caractéristiques. Les pastilles ne sont pas
 * des arguments écrits à la main — elles viennent de la fiche produit, ce qui
 * garantit qu'une valise annoncée « 40 L » l'est réellement.
 *
 * Le titre se coupe en deux : la première moitié à l'encre, la seconde au bleu
 * de l'enseigne. Le gérant écrit « Des bagages qui tiennent, / rien de plus. »
 * avec une barre oblique, et l'application place la césure.
 */
export function Hero({
    blocks,
    vedettes,
    mentions,
}: {
    blocks: HeroBlock[];
    vedettes: Vedette[];
    mentions: string[];
}) {
    const [index, setIndex] = useState(0);
    const bloc = blocks[0];
    const vedette = vedettes[index];

    const [avant, apres] = splitTitle(
        bloc?.title ?? 'Des bagages qui tiennent, / rien de plus.',
    );

    return (
        <section className="vitrine-halo relative overflow-hidden">
            <div className="mx-auto grid max-w-[1500px] items-center gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:py-20">
                {/* ---------------------------------------------- Accroche */}
                <div className="max-w-xl space-y-7">
                    <p className="anim-entree flex items-center gap-2.5 text-sm text-[var(--vitrine-encre)]/65">
                        <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping bg-[var(--vitrine-or)] opacity-60" />
                            <span className="relative inline-flex size-2 bg-[var(--vitrine-or)]" />
                        </span>
                        {bloc?.subtitle ??
                            'Valises et bagages — Dakar, Sénégal'}
                    </p>

                    <h1
                        style={{ animationDelay: '80ms' }}
                        className="vitrine-affiche anim-entree"
                    >
                        {avant}
                        {apres ? (
                            <>
                                <br />
                                <span className="text-[var(--vitrine-bleu)]">
                                    {apres}
                                </span>
                            </>
                        ) : null}
                    </h1>

                    <p
                        style={{ animationDelay: '140ms' }}
                        className="vitrine-texte anim-entree max-w-lg text-base leading-relaxed text-[var(--vitrine-encre)]/65 sm:text-lg"
                    >
                        {bloc?.body ??
                            'Valises rigides, souples, sacs de voyage et accessoires. Livraison partout au Sénégal, paiement à la réception.'}
                    </p>

                    <div
                        style={{ animationDelay: '200ms' }}
                        className="anim-entree flex flex-wrap gap-3"
                    >
                        <ShopButton
                            href={bloc?.linkUrl ?? '/boutique/catalogue'}
                            variant="pilule"
                        >
                            {bloc?.linkLabel ?? 'Voir nos valises'}
                            <ArrowRight className="size-4" />
                        </ShopButton>
                        <ShopButton href="/boutique/coffre" variant="verre">
                            <Info className="size-4" />
                            Le coffre
                        </ShopButton>
                    </div>

                    {/* Moyens de paiement : ce que le visiteur veut savoir
                        avant même de regarder les prix. */}
                    <div
                        style={{ animationDelay: '260ms' }}
                        className="anim-entree flex flex-wrap items-center gap-x-6 gap-y-3 pt-1"
                    >
                        <Paiement nom="Wave" couleur="#1dc4f2" initiale="W" />
                        <Paiement
                            nom="Orange Money"
                            couleur="#ff6600"
                            initiale="O"
                        />
                        <Paiement
                            nom="Espèces"
                            couleur="var(--vitrine-bleu)"
                            initiale="F"
                        />
                    </div>

                    {mentions.length > 0 ? (
                        <ul
                            style={{ animationDelay: '320ms' }}
                            className="anim-entree flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--vitrine-trait)] pt-5"
                        >
                            {mentions.map((mention) => (
                                <li
                                    key={mention}
                                    className="vitrine-mono flex items-center gap-2 text-[var(--vitrine-encre)]/45"
                                >
                                    <span className="size-1 bg-[var(--vitrine-or)]" />
                                    {mention}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>

                {/* ---------------------------------------------- Vitrine */}
                {vedette ? (
                    <div className="anim-entree space-y-6 lg:pl-6">
                        <div className="relative mx-auto max-w-lg">
                            <div className="verre aspect-square overflow-hidden">
                                {vedette.image ? (
                                    /*
                                     * La photo dérive un peu plus lentement
                                     * que la page. C'est ce décalage qui donne
                                     * la profondeur — l'amplitude reste sous
                                     * les 4 % pour qu'on le sente sans le
                                     * remarquer.
                                     */
                                    <img
                                        key={vedette.id}
                                        src={vedette.image}
                                        alt={vedette.name}
                                        className="anim-parallaxe size-full object-cover"
                                    />
                                ) : (
                                    <span className="flex size-full items-center justify-center text-[var(--vitrine-encre)]/25">
                                        <ImageIcon className="size-12" />
                                    </span>
                                )}
                            </div>

                            {/*
                             * Les caractéristiques, posées aux quatre coins.
                             * Masquées sur les très petits écrans : elles
                             * recouvriraient la valise au lieu de la décrire.
                             */}
                            {vedette.specs.map((spec, position) => (
                                <span
                                    key={spec}
                                    style={{
                                        animationDelay: `${300 + position * 90}ms`,
                                    }}
                                    className={cn(
                                        'verre-dense anim-entree absolute hidden px-3 py-1.5 text-xs font-medium whitespace-nowrap text-[var(--vitrine-encre)] sm:block',
                                        COINS[position % COINS.length],
                                    )}
                                >
                                    {spec}
                                </span>
                            ))}
                        </div>

                        <div className="space-y-1.5 text-center">
                            <Link
                                href={`/boutique/produit/${vedette.slug}`}
                                className="block text-xl font-semibold transition-opacity hover:opacity-70 sm:text-2xl"
                            >
                                {vedette.name}
                            </Link>
                            <p className="text-sm text-[var(--vitrine-encre)]/60">
                                {vedette.tagline}
                            </p>
                            <p className="text-sm font-medium text-[var(--vitrine-bleu)] tabular-nums">
                                À partir de {money(vedette.price)}
                            </p>
                        </div>

                        {/* Pastilles de défilement : seulement s'il y a une suite */}
                        {vedettes.length > 1 ? (
                            <div className="flex justify-center gap-2">
                                {vedettes.map((candidate, position) => (
                                    <button
                                        key={candidate.id}
                                        type="button"
                                        onClick={() => setIndex(position)}
                                        aria-label={candidate.name}
                                        className={cn(
                                            'h-1.5 transition-[width,background-color] duration-300',
                                            position === index
                                                ? 'w-8 bg-[var(--vitrine-bleu)]'
                                                : 'w-4 bg-[var(--vitrine-encre)]/20 hover:bg-[var(--vitrine-encre)]/40',
                                        )}
                                    />
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

function Paiement({
    nom,
    couleur,
    initiale,
}: {
    nom: string;
    couleur: string;
    initiale: string;
}) {
    return (
        <span className="flex items-center gap-2 text-sm text-[var(--vitrine-encre)]/70">
            <span
                aria-hidden
                className="flex size-6 items-center justify-center text-[11px] font-bold text-white"
                style={{ background: couleur }}
            >
                {initiale}
            </span>
            {nom}
        </span>
    );
}

/**
 * Coupe le titre en deux moitiés.
 *
 * La barre oblique est le point de césure choisi par le gérant. Sans elle, on
 * coupe après la première virgule — ce qui donne presque toujours le bon
 * résultat sur un titre de deux propositions.
 */
function splitTitle(title: string): [string, string | null] {
    if (title.includes('/')) {
        const [avant, ...reste] = title.split('/');

        return [avant.trim(), reste.join('/').trim() || null];
    }

    const virgule = title.indexOf(',');

    if (virgule > 0 && virgule < title.length - 1) {
        return [
            title.slice(0, virgule + 1).trim(),
            title.slice(virgule + 1).trim(),
        ];
    }

    return [title, null];
}
