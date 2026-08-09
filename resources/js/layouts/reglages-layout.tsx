import { Link } from '@inertiajs/react';
import {
    Building2,
    LayoutTemplate,
    MapPin,
    Plug,
    Store,
    Tags,
    UsersRound,
} from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn } from '@/lib/utils';

/**
 * Sous-menu des réglages.
 *
 * Tout ce qui se règle une fois puis ne bouge plus est regroupé ici, pour que
 * le menu principal ne garde que le travail de tous les jours.
 */
const sections = [
    { title: 'Boutique', href: '/reglages/boutique', icon: Store },
    { title: 'Catégories', href: '/reglages/categories', icon: Tags },
    { title: 'Marques', href: '/reglages/marques', icon: Tags },
    { title: 'Fournisseurs', href: '/reglages/fournisseurs', icon: Building2 },
    { title: 'Utilisateurs', href: '/reglages/utilisateurs', icon: UsersRound },
    { title: 'Livraison', href: '/reglages/livraison', icon: MapPin },
    { title: 'Accueil boutique', href: '/reglages/accueil-boutique', icon: LayoutTemplate },
    { title: 'Intégrations', href: '/reglages/integrations', icon: Plug },
];

export default function ReglagesLayout({ children }: PropsWithChildren) {
    const { isCurrentUrl } = useCurrentUrl();

    return (
        <div className="flex flex-1 flex-col gap-4 p-4">
            <div>
                <h1 className="text-xl font-semibold tracking-tight">
                    Réglages
                </h1>
                <p className="text-sm text-muted-foreground">
                    Les informations de la boutique et les listes de référence.
                </p>
            </div>

            <nav
                aria-label="Réglages"
                className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1"
            >
                {sections.map((section) => (
                    <Link
                        key={section.href}
                        href={section.href}
                        className={cn(
                            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-[color,background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97]',
                            isCurrentUrl(section.href)
                                ? 'bg-background font-medium shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <section.icon className="size-4" />
                        {section.title}
                    </Link>
                ))}
            </nav>

            {children}
        </div>
    );
}
