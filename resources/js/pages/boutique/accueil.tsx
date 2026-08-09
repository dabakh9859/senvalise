import { Head, Link } from '@inertiajs/react';
import {
    ArrowRight,
    BadgeCheck,
    Briefcase,
    Backpack,
    ImageIcon,
    Luggage,
    PiggyBank,
    Play,
    ShieldCheck,
    ShoppingBag,
    Truck,
    Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Hero } from '@/components/boutique/hero';
import type { Vedette } from '@/components/boutique/hero';
import { ProductCard } from '@/components/boutique/product-card';
import type { ProductCardData } from '@/components/boutique/product-card';
import {
    cascade,
    Rail,
    Section,
    SectionHeader,
    ShopButton,
} from '@/components/boutique/vitrine';
import { count } from '@/lib/format';

type Block = {
    id: number;
    title: string | null;
    subtitle: string | null;
    body: string | null;
    image: string | null;
    video: string | null;
    linkUrl: string | null;
    linkLabel: string | null;
    product: ProductCardData | null;
};

type CategoryCard = {
    name: string;
    slug: string;
    description: string | null;
    count: number;
    image: string | null;
};

/** Icônes de catégorie, dans l'ordre où les catégories arrivent. */
const ICONES_CATEGORIE: LucideIcon[] = [
    Luggage,
    Backpack,
    Briefcase,
    ShoppingBag,
    Wallet,
    BadgeCheck,
];

const ICONES_ATOUT: LucideIcon[] = [Truck, ShieldCheck, PiggyBank, BadgeCheck];

const ARGUMENTS_PAR_DEFAUT = [
    {
        title: 'Livraison dans tout le Sénégal',
        body: 'Dakar sous 24 h, régions sous 3 jours.',
    },
    {
        title: 'Garantie constructeur',
        body: 'Roulettes, poignées et serrures couvertes.',
    },
    {
        title: 'Le coffre',
        body: 'Mettez de côté, achetez quand vous êtes prêt.',
    },
    {
        title: 'Payez à la livraison',
        body: 'Espèces, Wave, Orange Money ou Free Money.',
    },
];

export default function Accueil({
    hero,
    vedettes,
    videos,
    promos,
    arguments: atouts,
    nouveautes,
    bestsellers,
    bonnesAffaires,
    categories,
}: {
    hero: Block[];
    vedettes: Vedette[];
    videos: Block[];
    promos: Block[];
    arguments: Block[];
    nouveautes: ProductCardData[];
    bestsellers: ProductCardData[];
    bonnesAffaires: ProductCardData[];
    categories: CategoryCard[];
}) {
    const atoutsAffiches = atouts.length > 0 ? atouts : ARGUMENTS_PAR_DEFAUT;
    const mentions = atoutsAffiches
        .map((atout) => atout.title)
        .filter((titre): titre is string => Boolean(titre))
        .slice(0, 3);

    return (
        <>
            <Head title="Valises et bagages à Dakar" />

            <Hero blocks={hero} vedettes={vedettes} mentions={mentions} />

            {/* ------------------------------------------------ Atouts */}
            <div className="border-y border-[var(--vitrine-trait)] bg-[var(--vitrine-papier)]">
                <div className="mx-auto grid max-w-[1500px] gap-px bg-[var(--vitrine-trait)] sm:grid-cols-2 lg:grid-cols-4">
                    {atoutsAffiches.map((atout, index) => {
                        const Icon = ICONES_ATOUT[index % ICONES_ATOUT.length];

                        return (
                            <div
                                key={atout.title ?? index}
                                style={cascade(index)}
                                className="anim-revele group flex items-start gap-3.5 bg-[var(--vitrine-papier)] px-6 py-7"
                            >
                                <Icon className="mt-0.5 size-5 shrink-0 text-[var(--vitrine-bleu)] transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-110" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold">
                                        {atout.title}
                                    </p>
                                    <p className="mt-1 text-xs text-[var(--vitrine-encre)]/60">
                                        {atout.body}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ------------------------------------------------ Catégories */}
            {categories.length > 0 ? (
                <div className="vitrine-halo">
                    <Section wide>
                        <SectionHeader
                            align="center"
                            kicker="Pour chaque façon de partir"
                            title="Nos catégories"
                            subtitle="Trouvez le bagage qui vous correspond."
                        />

                        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                            {categories.slice(0, 6).map((categorie, index) => {
                                const Icon =
                                    ICONES_CATEGORIE[
                                        index % ICONES_CATEGORIE.length
                                    ];

                                return (
                                    /*
                                     * Deux éléments imbriqués, et il le faut :
                                     * une animation garde la main sur
                                     * `transform` tant qu'elle est active. Le
                                     * survol qui soulève la tuile serait donc
                                     * sans effet s'il partageait l'élément qui
                                     * porte l'apparition.
                                     */
                                    <div
                                        key={categorie.slug}
                                        style={cascade(index)}
                                        className="anim-revele"
                                    >
                                        <Link
                                            href={`/boutique/catalogue?categorie=${categorie.slug}`}
                                            className="verre group flex h-full flex-col items-center gap-3 p-5 text-center transition-transform duration-200 ease-out hover:-translate-y-1"
                                        >
                                            {/* La photo du premier article de la
                                            catégorie si elle existe, l'icône
                                            sinon — jamais un carré vide. */}
                                            <span className="flex size-16 items-center justify-center overflow-hidden bg-[var(--vitrine-bleu)] text-white">
                                                {categorie.image ? (
                                                    <img
                                                        src={categorie.image}
                                                        alt=""
                                                        loading="lazy"
                                                        className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    />
                                                ) : (
                                                    <Icon className="size-7" />
                                                )}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-semibold">
                                                    {categorie.name}
                                                </span>
                                                <span className="mt-0.5 block truncate text-xs text-[var(--vitrine-encre)]/55">
                                                    {categorie.description ??
                                                        `${count(categorie.count)} article${categorie.count > 1 ? 's' : ''}`}
                                                </span>
                                            </span>
                                        </Link>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>
                </div>
            ) : null}

            {/* ------------------------------------------------ Populaires */}
            <RailProduits
                kicker="Éprouvées sur la route"
                titre="Produits populaires"
                sousTitre="Les valises que nos clients emportent le plus souvent."
                produits={bestsellers}
            />

            {/* ------------------------------------------------ Promotions */}
            {promos.length > 0 ? (
                <Section wide className="pt-0">
                    <div className="grid gap-3 lg:grid-cols-2">
                        {promos.map((promo, index) => (
                            <article
                                key={promo.id}
                                style={cascade(index)}
                                className="anim-revele group relative aspect-[16/9] overflow-hidden bg-[var(--vitrine-encre)]"
                            >
                                {(promo.image ?? promo.product?.image) ? (
                                    <img
                                        src={
                                            promo.image ??
                                            promo.product?.image ??
                                            ''
                                        }
                                        alt=""
                                        loading="lazy"
                                        className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                                    />
                                ) : null}

                                <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />

                                <div className="absolute inset-0 flex flex-col justify-center gap-3 p-7 text-white sm:p-10">
                                    {/* La pastille respire doucement : c'est
                                        ce qui attire l'œil sur la promotion
                                        sans qu'elle clignote. */}
                                    <span className="vitrine-mono w-fit bg-[var(--vitrine-or)] px-2.5 py-1 text-[var(--vitrine-encre)] transition-transform duration-300 ease-out group-hover:scale-105">
                                        Promotion
                                    </span>
                                    <h3 className="vitrine-serif max-w-sm text-2xl sm:text-4xl">
                                        {promo.title ??
                                            promo.product?.name ??
                                            'Offre du moment'}
                                    </h3>
                                    {promo.subtitle ? (
                                        <p className="max-w-sm text-sm text-white/85">
                                            {promo.subtitle}
                                        </p>
                                    ) : null}
                                    <ShopButton
                                        href={
                                            promo.linkUrl ??
                                            (promo.product
                                                ? `/boutique/produit/${promo.product.slug}`
                                                : '/boutique/catalogue')
                                        }
                                        variant="inverse"
                                        className="mt-2 w-fit"
                                    >
                                        {promo.linkLabel ?? 'J’en profite'}
                                        <ArrowRight className="size-4" />
                                    </ShopButton>
                                </div>
                            </article>
                        ))}
                    </div>
                </Section>
            ) : null}

            {/* ------------------------------------------------ Nouveautés */}
            <RailProduits
                kicker="Tout juste arrivées"
                titre="Les nouveautés"
                sousTitre="Les derniers modèles rentrés en boutique."
                produits={nouveautes}
                halo
            />

            {/* ------------------------------------------------ Le coffre */}
            <section className="relative overflow-hidden bg-[var(--vitrine-encre)] text-white">
                <div className="absolute inset-0 opacity-40">
                    <div className="absolute -top-32 -left-24 size-[36rem] bg-[var(--vitrine-bleu)] blur-[120px]" />
                    <div className="absolute -right-24 -bottom-32 size-[30rem] bg-[var(--vitrine-or)] blur-[140px]" />
                </div>

                <div className="relative mx-auto grid max-w-[1500px] gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center">
                    <div className="space-y-5">
                        <span
                            style={cascade(0)}
                            className="vitrine-mono anim-revele flex w-fit items-center gap-2 bg-white/10 px-3 py-1.5"
                        >
                            <PiggyBank className="size-3.5" />
                            Sans intérêt, sans engagement
                        </span>
                        <h2
                            style={cascade(1)}
                            className="vitrine-titre anim-revele"
                        >
                            Une valise qui vous plaît,
                            <br />
                            <span className="text-[var(--vitrine-or)]">
                                mais pas tout de suite ?
                            </span>
                        </h2>
                        <p
                            style={cascade(2)}
                            className="anim-revele max-w-lg text-white/70"
                        >
                            Ouvrez un coffre et versez ce que vous pouvez, quand
                            vous le pouvez. Le jour où l’objectif est atteint,
                            vous commandez. Et si vous changez d’avis, l’argent
                            vous est rendu.
                        </p>
                        <div style={cascade(3)} className="anim-revele">
                            <ShopButton
                                href="/boutique/coffre"
                                variant="inverse"
                            >
                                Découvrir le coffre
                                <ArrowRight className="size-4" />
                            </ShopButton>
                        </div>
                    </div>

                    <ol className="grid gap-px bg-white/10 sm:grid-cols-2">
                        {[
                            'Choisissez la valise ou fixez un montant.',
                            'Passez en boutique verser ce que vous voulez.',
                            'Suivez votre progression depuis votre espace.',
                            'Objectif atteint : commandez, c’est déjà payé.',
                        ].map((etape, index) => (
                            <li
                                key={etape}
                                style={cascade(index)}
                                className="anim-revele group space-y-2 bg-[var(--vitrine-encre)] p-6"
                            >
                                <span className="vitrine-serif block text-2xl text-[var(--vitrine-or)]/50 tabular-nums transition-colors duration-300 group-hover:text-[var(--vitrine-or)]">
                                    0{index + 1}
                                </span>
                                <span className="block text-sm text-white/85">
                                    {etape}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* ------------------------------------------------ Bonnes affaires */}
            <RailProduits
                kicker="Quantités limitées"
                titre="Bonnes affaires"
                sousTitre="Prix réduits sur une sélection d’articles."
                produits={bonnesAffaires}
                halo
            />

            {/* ------------------------------------------------ Vidéos */}
            {videos.length > 0 ? (
                <Section wide>
                    <SectionHeader
                        kicker="En images"
                        title="Nos valises en situation"
                    />

                    <div className="mt-8 grid gap-3 lg:grid-cols-2">
                        {videos.map((video, index) => (
                            <figure
                                key={video.id}
                                style={cascade(index)}
                                className="anim-revele"
                            >
                                <div className="aspect-video bg-[var(--vitrine-encre)]">
                                    {video.video ? (
                                        <iframe
                                            src={toEmbed(video.video)}
                                            title={video.title ?? 'Publicité'}
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                            loading="lazy"
                                            className="size-full"
                                        />
                                    ) : (
                                        <span className="flex size-full items-center justify-center text-white/40">
                                            <Play className="size-10" />
                                        </span>
                                    )}
                                </div>
                                {video.title || video.subtitle ? (
                                    <figcaption className="space-y-1 pt-3">
                                        <p className="text-sm font-semibold">
                                            {video.title}
                                        </p>
                                        {video.subtitle ? (
                                            <p className="text-sm text-[var(--vitrine-encre)]/60">
                                                {video.subtitle}
                                            </p>
                                        ) : null}
                                    </figcaption>
                                ) : null}
                            </figure>
                        ))}
                    </div>
                </Section>
            ) : null}

            {/* ------------------------------------------------ Invitation */}
            <div className="vitrine-halo border-t border-[var(--vitrine-trait)]">
                <div className="mx-auto max-w-2xl space-y-5 px-5 py-20 text-center">
                    <h2 className="vitrine-titre anim-revele">
                        Une question sur un modèle&nbsp;?
                    </h2>
                    <p
                        style={cascade(1)}
                        className="vitrine-texte anim-revele text-[var(--vitrine-encre)]/60"
                    >
                        Dites-nous ce que vous cherchez : capacité, format
                        cabine, résistance. Nous répondons vite, et nous
                        connaissons chaque pièce du rayon.
                    </p>
                    <div
                        style={cascade(2)}
                        className="anim-revele flex flex-wrap justify-center gap-3 pt-1"
                    >
                        <ShopButton href="/boutique/contact" variant="pilule">
                            Nous écrire
                            <ArrowRight className="size-4" />
                        </ShopButton>
                        <ShopButton href="/boutique/catalogue" variant="verre">
                            Parcourir le catalogue
                        </ShopButton>
                    </div>
                </div>
            </div>
        </>
    );
}

function RailProduits({
    kicker,
    titre,
    sousTitre,
    produits,
    halo,
}: {
    kicker: string;
    titre: string;
    sousTitre: string;
    produits: ProductCardData[];
    halo?: boolean;
}) {
    if (produits.length === 0) {
        return null;
    }

    const contenu = (
        <Section wide>
            <SectionHeader
                kicker={kicker}
                title={titre}
                subtitle={sousTitre}
                action={
                    <ShopButton
                        href="/boutique/catalogue"
                        variant="verre"
                        className="hidden shrink-0 px-5 py-2.5 sm:inline-flex"
                    >
                        Voir tout
                    </ShopButton>
                }
            />

            <Rail className="mt-8">
                {produits.map((produit, index) => (
                    <ProductCard
                        key={produit.id}
                        product={produit}
                        delay={index * 40}
                        className="w-[calc(66vw)] shrink-0 snap-start sm:w-[38vw] lg:w-[23vw] xl:w-[19vw]"
                    />
                ))}
            </Rail>
        </Section>
    );

    return halo ? <div className="vitrine-halo">{contenu}</div> : contenu;
}

/**
 * Transforme une adresse YouTube ou Vimeo en adresse intégrable.
 *
 * Le gérant colle le lien qu'il a sous la main ; c'est à l'application de le
 * comprendre, pas à lui de connaître la forme « /embed/ ».
 */
function toEmbed(url: string): string {
    const youtube = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
    );

    if (youtube) {
        return `https://www.youtube.com/embed/${youtube[1]}`;
    }

    const vimeo = url.match(/vimeo\.com\/(\d+)/);

    if (vimeo) {
        return `https://player.vimeo.com/video/${vimeo[1]}`;
    }

    return url;
}

/** Espace réservé quand une image manque, pour ne jamais laisser un trou. */
export function SansImage() {
    return (
        <span className="flex size-full items-center justify-center text-[var(--vitrine-encre)]/25">
            <ImageIcon className="size-8" />
        </span>
    );
}
