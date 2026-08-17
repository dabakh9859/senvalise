import { Head, Link } from '@inertiajs/react';
import {
    ArrowRight,
    Backpack,
    BadgeCheck,
    Briefcase,
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
import { Cascade, Palier } from '@/components/boutique/mouvement';
import { ProductCard } from '@/components/boutique/product-card';
import type { ProductCardData } from '@/components/boutique/product-card';
import {
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

/**
 * La page d'accueil de la boutique.
 *
 * Le fil est celui d'une visite : ce qui rassure, ce qu'on vend, ce qui est en
 * promotion, comment on peut payer autrement, et enfin comment nous joindre.
 *
 * Une règle de composition tient toute la page : **deux sections voisines ne
 * se ressemblent jamais**. Il y avait auparavant trois rails de produits
 * identiques, séparés par des grilles régulières — chacun pris isolément était
 * juste, mais mis bout à bout ils donnaient une page qui se répète, où l'on
 * ne sait plus où l'on en est. Les nouveautés sont donc passées en grille
 * décalée, les catégories en grille asymétrique, et les promotions en deux
 * blocs de largeurs différentes.
 */
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

    /*
     * Cinq catégories, pas six.
     *
     * La grande tuile occupe quatre cases d'une grille de quatre colonnes ; il
     * en reste donc exactement quatre à remplir. Une sixième catégorie
     * ouvrirait une troisième rangée pour s'y retrouver seule, avec trois
     * cases vides à sa droite. Le lien « Tout le catalogue » est là pour
     * celles qui ne tiennent pas.
     */
    const [premiere, ...autresCategories] = categories.slice(0, 5);

    return (
        <>
            <Head title="Valises et bagages à Dakar" />

            <Hero blocks={hero} vedettes={vedettes} mentions={mentions} />

            {/* ------------------------------------------------ Atouts */}
            <div className="border-y border-[var(--vitrine-trait)] bg-[var(--vitrine-papier)]">
                <Cascade
                    pas={0.05}
                    className="mx-auto grid max-w-[1500px] gap-px bg-[var(--vitrine-trait)] sm:grid-cols-2 lg:grid-cols-4"
                >
                    {atoutsAffiches.map((atout, index) => {
                        const Icon = ICONES_ATOUT[index % ICONES_ATOUT.length];

                        return (
                            <Palier
                                key={atout.title ?? index}
                                className="group flex items-start gap-3.5 bg-[var(--vitrine-papier)] px-6 py-7"
                            >
                                <Icon className="mt-0.5 size-5 shrink-0 text-[var(--vitrine-terre)] transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-110" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold">
                                        {atout.title}
                                    </span>
                                    <span className="mt-1 block text-xs text-[var(--vitrine-encre)]/60">
                                        {atout.body}
                                    </span>
                                </span>
                            </Palier>
                        );
                    })}
                </Cascade>
            </div>

            {/* ------------------------------------------------ Catégories */}
            {premiere ? (
                <div className="vitrine-halo">
                    <Section wide className="pb-20 sm:pb-28">
                        <SectionHeader
                            kicker="Pour chaque façon de partir"
                            title="Nos catégories"
                            subtitle="Trouvez le bagage qui vous correspond."
                            action={
                                <ShopButton
                                    href="/boutique/catalogue"
                                    variant="verre"
                                    className="hidden shrink-0 px-5 py-2.5 sm:inline-flex"
                                >
                                    Tout le catalogue
                                </ShopButton>
                            }
                        />

                        {/*
                         * Grille asymétrique : la première catégorie occupe
                         * quatre cases, les suivantes une seule.
                         *
                         * Six tuiles rigoureusement égales ne hiérarchisent
                         * rien — l'œil les balaie sans savoir par où entrer.
                         * En donner une plus grande, avec sa photo en grand,
                         * ouvre la lecture ; les autres deviennent une liste
                         * qu'on parcourt ensuite. Le décalage suffit, aucune
                         * couleur n'est nécessaire pour créer la hiérarchie.
                         */}
                        <Cascade
                            pas={0.05}
                            className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4"
                        >
                            <Palier
                                depuis="gauche"
                                className="col-span-2 row-span-2"
                            >
                                <TuileCategorie
                                    categorie={premiere}
                                    icone={ICONES_CATEGORIE[0]}
                                    grande
                                />
                            </Palier>

                            {autresCategories.map((categorie, index) => (
                                <Palier key={categorie.slug}>
                                    <TuileCategorie
                                        categorie={categorie}
                                        icone={
                                            ICONES_CATEGORIE[
                                                (index + 1) %
                                                    ICONES_CATEGORIE.length
                                            ]
                                        }
                                    />
                                </Palier>
                            ))}
                        </Cascade>
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
                    {/*
                     * Sept douzièmes contre cinq : deux moitiés parfaitement
                     * égales donnent une page qui se plie en son milieu, et
                     * aucune des deux promotions ne prend le dessus. Le rapport
                     * inégal désigne celle qu'on regarde en premier.
                     */}
                    <Cascade pas={0.09} className="grid gap-3 lg:grid-cols-12">
                        {promos.slice(0, 2).map((promo, index) => (
                            <Palier
                                key={promo.id}
                                depuis={index === 0 ? 'gauche' : 'droite'}
                                balise="article"
                                className={
                                    index === 0
                                        ? 'group relative aspect-[16/10] overflow-hidden bg-[var(--vitrine-encre)] lg:col-span-7'
                                        : 'group relative aspect-[16/10] overflow-hidden bg-[var(--vitrine-encre)] lg:col-span-5'
                                }
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

                                <span
                                    aria-hidden
                                    className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent"
                                />

                                <div className="absolute inset-0 flex flex-col justify-end gap-3 p-7 text-white sm:p-10">
                                    <span className="vitrine-mono w-fit bg-[var(--vitrine-terre)] px-2.5 py-1 text-white transition-transform duration-300 ease-out group-hover:scale-105">
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
                            </Palier>
                        ))}
                    </Cascade>
                </Section>
            ) : null}

            {/* ------------------------------------------------ Nouveautés */}
            {nouveautes.length > 0 ? (
                <div className="vitrine-halo">
                    <Section wide>
                        <SectionHeader
                            kicker="Tout juste arrivées"
                            title="Les nouveautés"
                            subtitle="Les derniers modèles rentrés en boutique."
                        />

                        {/*
                         * Grille décalée, et non un troisième rail.
                         *
                         * Trois rails à la file donnent le même geste trois
                         * fois ; en changeant de forme ici, on redonne un
                         * repère au visiteur. Le décalage vertical d'une
                         * colonne sur deux casse la ligne d'horizon des
                         * photos — c'est ce qui distingue une planche de
                         * magazine d'un tableau à double entrée.
                         */}
                        <Cascade
                            pas={0.06}
                            className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4 lg:[&>*:nth-child(even)]:mt-14"
                        >
                            {nouveautes.slice(0, 8).map((produit) => (
                                <Palier key={produit.id}>
                                    <ProductCard product={produit} />
                                </Palier>
                            ))}
                        </Cascade>
                    </Section>
                </div>
            ) : null}

            {/* ------------------------------------------------ Le coffre */}
            <section className="relative overflow-hidden bg-[var(--vitrine-encre)] text-white">
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-40"
                >
                    <span className="absolute -top-32 -left-24 size-[36rem] bg-[var(--vitrine-terre)] blur-[120px]" />
                    <span className="absolute -right-24 -bottom-32 size-[30rem] bg-[var(--vitrine-sable)] blur-[140px]" />
                </span>

                <div className="relative mx-auto grid max-w-[1500px] gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.1fr] lg:items-center">
                    <Cascade pas={0.07} className="space-y-5">
                        <Palier
                            balise="span"
                            className="vitrine-mono flex w-fit items-center gap-2 bg-white/10 px-3 py-1.5"
                        >
                            <PiggyBank className="size-3.5" />
                            Sans intérêt, sans engagement
                        </Palier>
                        <Palier balise="h2" className="vitrine-titre">
                            Une valise qui vous plaît,
                            <br />
                            <span className="text-[var(--vitrine-terre-clair)]">
                                mais pas tout de suite&nbsp;?
                            </span>
                        </Palier>
                        <Palier balise="p" className="max-w-lg text-white/70">
                            Ouvrez un coffre et versez ce que vous pouvez, quand
                            vous le pouvez. Le jour où l’objectif est atteint,
                            vous commandez. Et si vous changez d’avis, l’argent
                            vous est rendu.
                        </Palier>
                        <Palier>
                            <ShopButton
                                href="/boutique/coffre"
                                variant="inverse"
                            >
                                Découvrir le coffre
                                <ArrowRight className="size-4" />
                            </ShopButton>
                        </Palier>
                    </Cascade>

                    {/*
                     * Les quatre étapes montent d'un cran par rapport à la
                     * colonne de texte : deux blocs alignés au pixel près se
                     * lisent comme un tableau, un léger décrochement les lit
                     * comme deux choses distinctes posées côte à côte.
                     */}
                    <Cascade
                        pas={0.06}
                        balise="ol"
                        className="grid gap-px bg-white/10 sm:grid-cols-2 lg:-mt-10"
                    >
                        {[
                            'Choisissez la valise ou fixez un montant.',
                            'Passez en boutique verser ce que vous voulez.',
                            'Suivez votre progression depuis votre espace.',
                            'Objectif atteint : commandez, c’est déjà payé.',
                        ].map((etape, index) => (
                            <Palier
                                key={etape}
                                balise="li"
                                className="group space-y-2 bg-[var(--vitrine-encre)] p-6"
                            >
                                <span className="vitrine-serif block text-3xl text-[var(--vitrine-terre-clair)]/50 tabular-nums transition-colors duration-300 group-hover:text-[var(--vitrine-terre-clair)]">
                                    0{index + 1}
                                </span>
                                <span className="block text-sm text-white/85">
                                    {etape}
                                </span>
                            </Palier>
                        ))}
                    </Cascade>
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

                    <Cascade
                        pas={0.08}
                        className="mt-8 grid gap-3 lg:grid-cols-2"
                    >
                        {videos.map((video) => (
                            <Palier key={video.id} balise="figure">
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
                            </Palier>
                        ))}
                    </Cascade>
                </Section>
            ) : null}

            {/* ------------------------------------------------ Invitation */}
            <div className="vitrine-halo border-t border-[var(--vitrine-trait)]">
                <Cascade
                    pas={0.07}
                    className="mx-auto max-w-2xl space-y-5 px-5 py-24 text-center sm:py-32"
                >
                    <Palier balise="h2" className="vitrine-titre">
                        Une question sur un modèle&nbsp;?
                    </Palier>
                    <Palier
                        balise="p"
                        className="vitrine-texte text-[var(--vitrine-encre)]/60"
                    >
                        Dites-nous ce que vous cherchez : capacité, format
                        cabine, résistance. Nous répondons vite, et nous
                        connaissons chaque pièce du rayon.
                    </Palier>
                    <Palier className="flex flex-wrap justify-center gap-3 pt-1">
                        <ShopButton href="/boutique/contact" variant="pilule">
                            Nous écrire
                            <ArrowRight className="size-4" />
                        </ShopButton>
                        <ShopButton href="/boutique/catalogue" variant="verre">
                            Parcourir le catalogue
                        </ShopButton>
                    </Palier>
                </Cascade>
            </div>
        </>
    );
}

/**
 * Une tuile de catégorie.
 *
 * En grand, la photo occupe toute la tuile et le texte se pose dessus, sur un
 * voile sombre — c'est l'entrée de la grille. En petit, la photo redevient une
 * vignette carrée à côté du nom : à cette taille, une image de fond rendrait
 * le libellé illisible sans apporter grand-chose.
 */
function TuileCategorie({
    categorie,
    icone: Icon,
    grande,
}: {
    categorie: CategoryCard;
    icone: LucideIcon;
    grande?: boolean;
}) {
    const sousTitre =
        categorie.description ??
        `${count(categorie.count)} article${categorie.count > 1 ? 's' : ''}`;

    if (grande) {
        return (
            <Link
                href={`/boutique/catalogue?categorie=${categorie.slug}`}
                className="group relative flex h-full min-h-64 flex-col justify-end overflow-hidden bg-[var(--vitrine-encre)] p-6 text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--vitrine-terre)] sm:p-8"
            >
                {categorie.image ? (
                    <>
                        <img
                            src={categorie.image}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        />
                        <span
                            aria-hidden
                            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
                        />
                    </>
                ) : (
                    <span
                        aria-hidden
                        className="absolute inset-0 flex items-center justify-center text-white/15"
                    >
                        <Icon className="size-24" />
                    </span>
                )}

                <span className="relative">
                    <span className="vitrine-serif block text-2xl sm:text-3xl">
                        {categorie.name}
                    </span>
                    <span className="mt-1 block text-sm text-white/75">
                        {sousTitre}
                    </span>
                </span>
            </Link>
        );
    }

    return (
        <Link
            href={`/boutique/catalogue?categorie=${categorie.slug}`}
            className="verre group flex h-full flex-col items-center gap-3 p-5 text-center transition-transform duration-200 ease-out outline-none hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--vitrine-terre)]"
        >
            <span className="flex size-16 items-center justify-center overflow-hidden bg-[var(--vitrine-terre)] text-white">
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
                    {sousTitre}
                </span>
            </span>
        </Link>
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
