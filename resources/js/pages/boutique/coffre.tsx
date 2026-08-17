import { Head, Link } from '@inertiajs/react';
import {
    ArrowRight,
    PiggyBank,
    RotateCcw,
    ShieldCheck,
    Wallet,
} from 'lucide-react';
import { Cascade, Palier } from '@/components/boutique/mouvement';
import { ProductCard } from '@/components/boutique/product-card';
import type { ProductCardData } from '@/components/boutique/product-card';
import {
    Section,
    SectionHeader,
    ShopButton,
} from '@/components/boutique/vitrine';
import { money } from '@/lib/format';

type MonCoffre = {
    id: number;
    label: string;
    target: number;
    saved: number;
    progress: number;
    statusLabel: string;
};

const ETAPES = [
    {
        titre: 'Vous choisissez votre objectif',
        texte: 'Une valise précise, ou simplement un montant. C’est vous qui décidez.',
    },
    {
        titre: 'Vous versez à votre rythme',
        texte: 'Passez en boutique quand vous voulez, avec ce que vous voulez. Espèces, Wave, Orange Money ou Free Money.',
    },
    {
        titre: 'Vous suivez votre progression',
        texte: 'Chaque versement est enregistré, daté, et visible depuis votre espace. Rien ne se perd.',
    },
    {
        titre: 'Objectif atteint : vous commandez',
        texte: 'Votre coffre règle la commande, livraison comprise. Il n’y a plus rien à payer.',
    },
];

const GARANTIES = [
    {
        icon: ShieldCheck,
        titre: 'Aucun intérêt, aucun frais',
        texte: 'Vous récupérez exactement ce que vous avez versé, au centime près.',
    },
    {
        icon: RotateCcw,
        titre: 'Remboursable à tout moment',
        texte: 'Vous changez d’avis ? Passez en boutique, on vous rend votre argent.',
    },
    {
        icon: Wallet,
        titre: 'Sans engagement de montant',
        texte: 'Pas de versement minimum, pas d’échéance à respecter. Vous versez quand vous pouvez.',
    },
];

/**
 * La page publique du coffre.
 *
 * Elle explique avant de demander quoi que ce soit. Un visiteur qui clique sur
 * « Le coffre » depuis le menu ne sait pas encore de quoi il s'agit :
 * l'envoyer sur une page protégée lui claquerait la porte au nez.
 */
export default function Coffre({
    suggestions,
    mesCoffres,
}: {
    suggestions: ProductCardData[];
    /** Null quand le visiteur n'a pas de compte. */
    mesCoffres: MonCoffre[] | null;
}) {
    const connecte = mesCoffres !== null;

    return (
        <>
            <Head title="Le coffre" />

            {/* ------------------------------------------------ Promesse */}
            <section className="border-b border-[var(--vitrine-trait)] bg-[var(--vitrine-encre)] text-white">
                <div className="mx-auto max-w-[1600px] px-4 py-16 sm:py-24">
                    <div className="max-w-2xl space-y-6">
                        <span className="anim-entree flex size-12 items-center justify-center bg-[var(--vitrine-terre)]">
                            <PiggyBank className="size-6" />
                        </span>
                        <p className="vitrine-surtitre anim-entree text-white/70">
                            La mise de côté, tenue par écrit
                        </p>
                        <h1
                            style={{ animationDelay: '80ms' }}
                            className="vitrine-titre anim-entree text-4xl sm:text-6xl"
                        >
                            Achetez à votre rythme
                        </h1>
                        <p
                            style={{ animationDelay: '140ms' }}
                            className="anim-entree text-lg text-white/75"
                        >
                            Une valise à 180 000 F ne se paie pas toujours d’un
                            coup. Ouvrez un coffre, versez ce que vous pouvez
                            quand vous le pouvez, et repartez avec votre bagage
                            le jour où l’objectif est atteint.
                        </p>
                        <div
                            style={{ animationDelay: '200ms' }}
                            className="anim-entree flex flex-wrap gap-3 pt-2"
                        >
                            {connecte ? (
                                <ShopButton href="/boutique/espace/coffres">
                                    Voir mes coffres
                                    <ArrowRight className="size-4" />
                                </ShopButton>
                            ) : (
                                <>
                                    <ShopButton href="/boutique/inscription">
                                        Créer mon compte
                                        <ArrowRight className="size-4" />
                                    </ShopButton>
                                    <ShopButton
                                        href="/boutique/connexion"
                                        variant="outline"
                                        className="text-white"
                                    >
                                        J’ai déjà un compte
                                    </ShopButton>
                                </>
                            )}
                        </div>
                        {!connecte ? (
                            <p className="anim-entree text-sm text-white/50">
                                Un compte est nécessaire pour ouvrir un coffre :
                                c’est ce qui vous permet de suivre vos
                                versements.
                            </p>
                        ) : null}
                    </div>
                </div>
            </section>

            {/* ------------------------------------------------ Mes coffres */}
            {connecte && mesCoffres.length > 0 ? (
                <Section wide className="pb-0">
                    <SectionHeader
                        kicker="Là où vous en êtes"
                        title="Mes coffres"
                        action={
                            <Link
                                href="/boutique/espace/coffres"
                                className="vitrine-libelle shrink-0 border-b border-current pb-0.5 text-xs transition-opacity hover:opacity-70"
                            >
                                Gérer
                            </Link>
                        }
                    />

                    <Cascade
                        pas={0.05}
                        className="mt-8 grid gap-px bg-[var(--vitrine-trait)] sm:grid-cols-2 lg:grid-cols-3"
                    >
                        {mesCoffres.map((coffre) => (
                            /*
                             * Le `Palier` porte le fond et le survol, le lien
                             * porte le contenu. Il faut les deux : le fond doit
                             * appartenir à l'enfant direct de la grille, sinon
                             * les filets d'un pixel qui séparent les cases
                             * disparaissent.
                             */
                            <Palier
                                key={coffre.id}
                                className="bg-[var(--vitrine-papier)] transition-colors hover:bg-[var(--vitrine-sable)]"
                            >
                                <Link
                                    href="/boutique/espace/coffres"
                                    className="block h-full space-y-3 p-5"
                                >
                                    <p className="flex items-baseline justify-between gap-3">
                                        <span className="vitrine-libelle text-xs">
                                            {coffre.label}
                                        </span>
                                        <span className="text-xs text-[var(--vitrine-encre)]/60">
                                            {coffre.statusLabel}
                                        </span>
                                    </p>
                                    <span className="block h-2 w-full overflow-hidden bg-[var(--vitrine-sable)]">
                                        <span
                                            className="anim-barre-h block h-full bg-[var(--vitrine-terre)]"
                                            style={{
                                                width: `${Math.max(coffre.progress, 2)}%`,
                                            }}
                                        />
                                    </span>
                                    <p className="flex items-baseline justify-between gap-3 tabular-nums">
                                        <span className="text-lg font-semibold">
                                            {money(coffre.saved)}
                                        </span>
                                        <span className="text-sm text-[var(--vitrine-encre)]/60">
                                            sur {money(coffre.target)}
                                        </span>
                                    </p>
                                </Link>
                            </Palier>
                        ))}
                    </Cascade>
                </Section>
            ) : null}

            {/* ------------------------------------------------ Comment ça marche */}
            <Section wide>
                <SectionHeader
                    align="center"
                    kicker="En quatre temps"
                    title="Comment ça marche"
                />

                <Cascade
                    pas={0.06}
                    balise="ol"
                    className="mt-10 grid gap-px bg-[var(--vitrine-trait)] sm:grid-cols-2 lg:grid-cols-4"
                >
                    {ETAPES.map((etape, index) => (
                        <Palier
                            key={etape.titre}
                            balise="li"
                            className="space-y-3 bg-[var(--vitrine-papier)] p-6"
                        >
                            <span className="vitrine-titre block text-3xl text-[var(--vitrine-encre)]/30 tabular-nums">
                                0{index + 1}
                            </span>
                            <p className="vitrine-libelle text-xs">
                                {etape.titre}
                            </p>
                            <p className="text-sm text-[var(--vitrine-encre)]/60">
                                {etape.texte}
                            </p>
                        </Palier>
                    ))}
                </Cascade>
            </Section>

            {/* ------------------------------------------------ Garanties */}
            <section className="border-y bg-[var(--vitrine-sable)]">
                <Cascade
                    pas={0.07}
                    className="mx-auto grid max-w-[1600px] gap-px bg-[var(--vitrine-trait)] lg:grid-cols-3"
                >
                    {GARANTIES.map((garantie) => (
                        <Palier
                            key={garantie.titre}
                            className="space-y-2 bg-[var(--vitrine-papier)] p-8"
                        >
                            <garantie.icon className="size-5 text-[var(--vitrine-terre)]" />
                            <p className="vitrine-libelle text-xs">
                                {garantie.titre}
                            </p>
                            <p className="text-sm text-[var(--vitrine-encre)]/60">
                                {garantie.texte}
                            </p>
                        </Palier>
                    ))}
                </Cascade>
            </section>

            {/* ------------------------------------------------ Suggestions */}
            {suggestions.length > 0 ? (
                <Section wide>
                    <SectionHeader
                        kicker="Un objectif en tête ?"
                        title="Quelques idées"
                        subtitle="Choisissez l’article que vous visez, nous en reprenons le prix comme objectif."
                    />

                    <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4">
                        {suggestions.map((produit, index) => (
                            <ProductCard
                                key={produit.id}
                                product={produit}
                                revele
                                delay={index * 45}
                            />
                        ))}
                    </div>
                </Section>
            ) : null}

            {/* ------------------------------------------------ Rappel */}
            <section className="border-t">
                <div className="mx-auto max-w-3xl space-y-4 px-4 py-16 text-center">
                    <h2 className="vitrine-titre text-2xl sm:text-3xl">
                        Prêt à commencer&nbsp;?
                    </h2>
                    <p className="text-[var(--vitrine-encre)]/60">
                        Ouvrez votre coffre en ligne, puis passez en boutique
                        faire votre premier versement. Il n’y a pas de montant
                        minimum.
                    </p>
                    <div className="flex justify-center pt-2">
                        <ShopButton
                            href={
                                connecte
                                    ? '/boutique/espace/coffres'
                                    : '/boutique/inscription'
                            }
                        >
                            {connecte ? 'Ouvrir un coffre' : 'Créer mon compte'}
                            <ArrowRight className="size-4" />
                        </ShopButton>
                    </div>
                </div>
            </section>
        </>
    );
}
