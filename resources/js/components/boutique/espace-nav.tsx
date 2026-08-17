import { Link, router, usePage } from '@inertiajs/react';
import { LogOut, PackageCheck, PiggyBank, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const ONGLETS = [
    { label: 'Aperçu', href: '/boutique/espace', icon: UserRound },
    {
        label: 'Mes commandes',
        href: '/boutique/espace/commandes',
        icon: PackageCheck,
    },
    { label: 'Mes coffres', href: '/boutique/espace/coffres', icon: PiggyBank },
    {
        label: 'Mes informations',
        href: '/boutique/espace/profil',
        icon: UserRound,
    },
];

/** Navigation de l'espace client : quatre onglets, pas un de plus. */
export function EspaceNav() {
    const { url } = usePage();

    return (
        <nav className="mb-6 flex gap-1 overflow-x-auto bg-[var(--vitrine-sable)] p-1">
            {ONGLETS.map((onglet) => {
                // « /espace » est le préfixe de tous les autres : on l'égalise
                // strictement, sinon l'aperçu resterait toujours actif.
                const active =
                    onglet.href === '/boutique/espace'
                        ? url === onglet.href
                        : url.startsWith(onglet.href);

                return (
                    <Link
                        key={onglet.href}
                        href={onglet.href}
                        className={cn(
                            'flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97]',
                            active
                                ? 'bg-[var(--vitrine-papier)] font-medium shadow-sm'
                                : 'text-[var(--vitrine-encre)]/60 hover:text-[var(--vitrine-encre)]',
                        )}
                    >
                        <onglet.icon className="size-4" />
                        {onglet.label}
                    </Link>
                );
            })}

            <button
                type="button"
                onClick={() => router.post('/boutique/deconnexion')}
                className="ml-auto flex shrink-0 items-center gap-2 px-3 py-2 text-sm text-[var(--vitrine-encre)]/60 transition-colors hover:text-destructive"
            >
                <LogOut className="size-4" />
                Se déconnecter
            </button>
        </nav>
    );
}

/** Barre d'avancement d'un coffre. */
export function VaultProgress({ progress }: { progress: number }) {
    return (
        <span className="block h-2 w-full overflow-hidden bg-[var(--vitrine-sable)]">
            <span
                className="anim-barre-h block h-full bg-[var(--vitrine-terre)] transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(progress, 2)}%` }}
            />
        </span>
    );
}
