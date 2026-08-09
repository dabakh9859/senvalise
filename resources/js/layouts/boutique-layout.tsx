import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Home,
    Menu,
    MessageCircle,
    PiggyBank,
    Search,
    ShoppingBag,
    ShoppingCart,
    UserRound,
    X,
} from 'lucide-react';
import type { PropsWithChildren, ReactNode } from 'react';
import { useState } from 'react';
import { Marque } from '@/components/boutique/marque';
import { ShopButton } from '@/components/boutique/vitrine';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type BoutiqueShared = {
    boutique: {
        panier: number;
        client: { name: string; firstName: string } | null;
    };
    shop: {
        name: string;
        logo: string | null;
        phone: string | null;
        address: string | null;
    };
};

/**
 * Titre de colonne du pied de page.
 *
 * Le même filet doré qu'en tête de section : c'est ce qui fait qu'on
 * reconnaît le même site en haut et en bas de la page.
 */
function ColonneTitre({ children }: { children: ReactNode }) {
    return (
        <p className="vitrine-surtitre flex items-center gap-3 text-white/45">
            <span aria-hidden className="h-px w-5 bg-[var(--vitrine-or)]" />
            {children}
        </p>
    );
}

/** Quatre entrées, pas une de plus : c'est ce qui rend une barre lisible. */
const LIENS = [
    { label: 'Valises', href: '/boutique/catalogue' },
    { label: 'Le coffre', href: '/boutique/coffre' },
    { label: 'Suivi', href: '/boutique/suivi' },
    { label: 'Contact', href: '/boutique/contact' },
];

/** La barre du pouce, sur téléphone. */
const RACCOURCIS = [
    { label: 'Accueil', href: '/boutique', icon: Home, exact: true },
    { label: 'Valises', href: '/boutique/catalogue', icon: ShoppingBag },
    { label: 'Coffre', href: '/boutique/coffre', icon: PiggyBank },
    { label: 'Panier', href: '/boutique/panier', icon: ShoppingCart },
    { label: 'Compte', href: '/boutique/espace', icon: UserRound },
];

const ANNONCES = [
    'Livraison partout au Sénégal',
    'Paiement à la livraison',
    'Le coffre : payez à votre rythme',
    'Garantie constructeur sur toute la gamme',
];

/**
 * La vitrine.
 *
 * La barre de navigation flotte en verre dépoli au-dessus de la page : elle
 * laisse deviner ce qui défile dessous plutôt que de le masquer. Sur
 * téléphone, une seconde barre se pose sous le pouce — c'est là que la main
 * tient l'appareil, pas en haut de l'écran.
 */
export default function BoutiqueLayout({ children }: PropsWithChildren) {
    const { props, url } = usePage<BoutiqueShared>();
    const { panier, client } = props.boutique;
    const [menuOpen, setMenuOpen] = useState(false);
    const [rechercheOuverte, setRechercheOuverte] = useState(false);
    const [search, setSearch] = useState('');

    const telephone = props.shop.phone?.replace(/\D/g, '');

    function submitSearch(event: React.FormEvent) {
        event.preventDefault();
        router.get('/boutique/catalogue', { recherche: search });
        setMenuOpen(false);
        setRechercheOuverte(false);
    }

    return (
        <div className="vitrine-anguleux vitrine-halo flex min-h-svh flex-col text-[var(--vitrine-encre)]">
            <Head>
                <meta name="theme-color" content="#1e3fa8" />
            </Head>

            {/*
             * Bandeau défilant. Le contenu est écrit deux fois : l'animation
             * translate de -50 %, la seconde copie prend exactement la place
             * de la première et la boucle ne se voit pas.
             */}
            <div className="group overflow-hidden bg-[var(--vitrine-encre)] py-1.5 text-white">
                {/* Le défilement s'arrête au survol : sinon on ne peut pas
                    finir de lire une annonce qui s'échappe. */}
                <div className="vitrine-defile flex w-max group-hover:[animation-play-state:paused]">
                    {[0, 1].map((copie) => (
                        <div
                            key={copie}
                            aria-hidden={copie === 1}
                            className="flex shrink-0 items-center"
                        >
                            {ANNONCES.map((annonce) => (
                                <span
                                    key={annonce}
                                    className="vitrine-mono flex items-center px-6 text-[10px] whitespace-nowrap text-white/80"
                                >
                                    {annonce}
                                    <span className="ml-6 size-1 bg-[var(--vitrine-or)]" />
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            <header className="vitrine-entete-flottante verre-dense sticky top-0 z-40 border-x-0 border-t-0">
                <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-5 sm:px-8">
                    <button
                        type="button"
                        onClick={() => setMenuOpen((open) => !open)}
                        className="-ml-2 p-2 transition-opacity hover:opacity-60 lg:hidden"
                        aria-label="Menu"
                    >
                        {menuOpen ? (
                            <X className="size-5" />
                        ) : (
                            <Menu className="size-5" />
                        )}
                    </button>

                    <Link
                        href="/boutique"
                        className="shrink-0 transition-opacity hover:opacity-70"
                    >
                        <Marque hauteur="h-9" />
                    </Link>

                    <nav className="ml-auto hidden items-center gap-9 lg:flex">
                        {LIENS.map((lien) => {
                            const actif = url.startsWith(lien.href);

                            return (
                                <Link
                                    key={lien.href}
                                    href={lien.href}
                                    className={cn(
                                        'group relative py-1 text-sm transition-colors',
                                        actif
                                            ? 'font-medium text-[var(--vitrine-encre)]'
                                            : 'text-[var(--vitrine-encre)]/60 hover:text-[var(--vitrine-encre)]',
                                    )}
                                >
                                    {lien.label}
                                    {/* Le filet pousse depuis la gauche au
                                        survol, et reste déployé sur la page
                                        courante. */}
                                    <span
                                        className={cn(
                                            'absolute inset-x-0 -bottom-1 h-0.5 origin-left bg-[var(--vitrine-bleu)] transition-transform duration-300 ease-out',
                                            actif
                                                ? 'scale-x-100'
                                                : 'scale-x-0 group-hover:scale-x-100',
                                        )}
                                    />
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="ml-auto flex items-center gap-1 lg:ml-9">
                        {/* La recherche s'ouvre à la demande : un champ
                            permanent occupe la barre sans être utilisé. */}
                        <button
                            type="button"
                            onClick={() => setRechercheOuverte((open) => !open)}
                            aria-label="Rechercher"
                            aria-expanded={rechercheOuverte}
                            className="p-2 transition-[opacity,transform] duration-150 hover:opacity-60 active:scale-90"
                        >
                            <Search className="size-[18px]" />
                        </button>

                        <Link
                            href={
                                client
                                    ? '/boutique/espace'
                                    : '/boutique/connexion'
                            }
                            aria-label={client ? 'Mon espace' : 'Se connecter'}
                            className="p-2 transition-[opacity,transform] duration-150 hover:opacity-60 active:scale-90"
                        >
                            <UserRound className="size-[18px]" />
                        </Link>

                        <Link
                            href="/boutique/panier"
                            aria-label="Panier"
                            className="relative p-2 transition-[opacity,transform] duration-150 hover:opacity-60 active:scale-90"
                        >
                            <ShoppingCart className="size-[18px]" />
                            {panier > 0 ? (
                                <span
                                    key={panier}
                                    className="anim-cellule absolute top-0.5 right-0.5 flex size-4 items-center justify-center bg-[var(--vitrine-bleu)] text-[10px] font-bold text-white tabular-nums"
                                >
                                    {panier}
                                </span>
                            ) : null}
                        </Link>
                    </div>
                </div>

                {rechercheOuverte ? (
                    <div className="border-t border-[var(--vitrine-trait)]/60 px-5 py-3 sm:px-8">
                        <form
                            onSubmit={submitSearch}
                            className="relative mx-auto max-w-[1500px]"
                        >
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-50" />
                            <Input
                                autoFocus
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Rechercher une valise, un sac, un accessoire…"
                                className="h-11 rounded-none border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
                            />
                        </form>
                    </div>
                ) : null}

                {menuOpen ? (
                    <nav className="grid border-t border-[var(--vitrine-trait)]/60 px-5 pb-3 lg:hidden">
                        {LIENS.map((lien, index) => (
                            <Link
                                key={lien.href}
                                href={lien.href}
                                onClick={() => setMenuOpen(false)}
                                style={{ animationDelay: `${index * 40}ms` }}
                                className="anim-entree border-b border-[var(--vitrine-trait)]/60 py-4 text-sm last:border-0"
                            >
                                {lien.label}
                            </Link>
                        ))}
                    </nav>
                ) : null}

                {/*
                 * Filet de progression. `scale-x-0` est l'état par défaut :
                 * là où les chronologies de défilement n'existent pas, le
                 * filet reste replié plutôt que de barrer l'écran en
                 * permanence.
                 */}
                <span
                    aria-hidden
                    className="vitrine-jauge absolute inset-x-0 bottom-0 h-0.5 scale-x-0 bg-[var(--vitrine-bleu)]"
                />
            </header>

            {/* La barre basse masque le bas de la page : on lui laisse la place. */}
            <main className="flex-1 pb-16 lg:pb-0">{children}</main>

            {/*
             * Le pied de page.
             *
             * Une même halo bleu que la section coffre, pour que le bas de la
             * page appartienne à la même maison plutôt que d'être un
             * rectangle noir rapporté. Le bandeau d'adieu passe avant les
             * colonnes : on quitte le site sur une phrase, pas sur un
             * annuaire de liens.
             */}
            <footer className="relative overflow-hidden bg-[var(--vitrine-encre)] text-white/65">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-35"
                >
                    <div className="absolute -top-40 left-1/4 size-[34rem] bg-[var(--vitrine-bleu)] blur-[130px]" />
                    <div className="absolute -right-32 -bottom-40 size-[26rem] bg-[var(--vitrine-or)] blur-[150px]" />
                </div>

                <div className="relative mx-auto max-w-[1500px] px-5 sm:px-8">
                    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-white/10 py-14">
                        <h2 className="vitrine-titre max-w-lg text-white">
                            Passez nous voir, ou faites-vous livrer.
                        </h2>
                        <div className="flex flex-wrap gap-3">
                            <ShopButton
                                href="/boutique/catalogue"
                                variant="inverse"
                            >
                                Voir les valises
                            </ShopButton>
                            {/* Le survol par défaut d'`outline` inverse vers
                                l'encre — invisible sur un fond déjà sombre. */}
                            <ShopButton
                                href="/boutique/contact"
                                variant="outline"
                                className="border-white/35 text-white hover:bg-white hover:text-[var(--vitrine-encre)]"
                            >
                                Nous écrire
                            </ShopButton>
                        </div>
                    </div>

                    <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-3">
                            <Marque hauteur="h-9" className="text-white" />
                            <p className="vitrine-texte text-sm">
                                Valises, bagages et accessoires de voyage.
                                {props.shop.address
                                    ? ` ${props.shop.address}.`
                                    : ''}
                            </p>
                            {props.shop.phone ? (
                                <a
                                    href={`tel:${telephone}`}
                                    className="inline-block text-sm text-white transition-opacity hover:opacity-70"
                                >
                                    {props.shop.phone}
                                </a>
                            ) : null}
                        </div>

                        <div className="space-y-3">
                            <ColonneTitre>La boutique</ColonneTitre>
                            {LIENS.map((lien) => (
                                <Link
                                    key={lien.href}
                                    href={lien.href}
                                    className="block text-sm transition-colors hover:text-white"
                                >
                                    {lien.label}
                                </Link>
                            ))}
                        </div>

                        <div className="space-y-3">
                            <ColonneTitre>Le coffre</ColonneTitre>
                            <p className="vitrine-texte text-sm">
                                Mettez de côté à votre rythme, achetez quand
                                votre objectif est atteint. Sans intérêt, sans
                                engagement.
                            </p>
                            <Link
                                href="/boutique/coffre"
                                className="inline-block border-b border-white/50 pb-0.5 text-sm text-white transition-colors hover:border-[var(--vitrine-or)]"
                            >
                                En savoir plus
                            </Link>
                        </div>

                        <div className="space-y-3">
                            <ColonneTitre>Mon compte</ColonneTitre>
                            <Link
                                href={
                                    client
                                        ? '/boutique/espace'
                                        : '/boutique/connexion'
                                }
                                className="block text-sm transition-colors hover:text-white"
                            >
                                {client
                                    ? `Bonjour ${client.firstName}`
                                    : 'Se connecter'}
                            </Link>
                            <Link
                                href="/boutique/espace/commandes"
                                className="block text-sm transition-colors hover:text-white"
                            >
                                Mes commandes
                            </Link>
                            <Link
                                href="/boutique/suivi"
                                className="block text-sm transition-colors hover:text-white"
                            >
                                Suivre une commande
                            </Link>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-6 text-xs text-white/40">
                        <p>
                            © {new Date().getFullYear()} {props.shop.name}
                        </p>
                        <p>
                            Paiement à la livraison — espèces, Wave, Orange
                            Money, Free Money.
                        </p>
                    </div>
                </div>
            </footer>

            {/* ---------------------------------------- Barre du pouce */}
            <nav className="verre-dense fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 lg:hidden">
                <div className="grid grid-cols-5">
                    {RACCOURCIS.map((raccourci) => {
                        const actif = raccourci.exact
                            ? url === raccourci.href
                            : url.startsWith(raccourci.href);

                        return (
                            <Link
                                key={raccourci.label}
                                href={raccourci.href}
                                className={cn(
                                    'relative flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
                                    actif
                                        ? 'font-medium text-[var(--vitrine-bleu)]'
                                        : 'text-[var(--vitrine-encre)]/55',
                                )}
                            >
                                <raccourci.icon className="size-[18px]" />
                                {raccourci.label}
                                {raccourci.label === 'Panier' && panier > 0 ? (
                                    <span className="absolute top-1.5 right-[22%] flex size-4 items-center justify-center bg-[var(--vitrine-bleu)] text-[9px] font-bold text-white tabular-nums">
                                        {panier}
                                    </span>
                                ) : null}
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/*
             * WhatsApp : au Sénégal c'est le premier réflexe pour poser une
             * question à un commerçant. Le bouton remonte au-dessus de la
             * barre du pouce pour ne pas la recouvrir.
             */}
            {telephone ? (
                <a
                    href={`https://wa.me/${telephone.startsWith('221') ? telephone : `221${telephone}`}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Nous écrire sur WhatsApp"
                    className="fixed right-5 bottom-20 z-40 flex size-12 items-center justify-center bg-[#25d366] text-white shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95 lg:bottom-6"
                >
                    <MessageCircle className="size-6" />
                </a>
            ) : null}
        </div>
    );
}
