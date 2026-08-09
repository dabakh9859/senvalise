import { usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import { cn } from '@/lib/utils';

type MarqueShared = {
    shop: { name: string; logo: string | null };
};

/**
 * La marque, telle qu'elle s'affiche en tête de la boutique.
 *
 * Si le gérant a déposé le fichier du logo dans _Réglages → Boutique_, c'est
 * lui qui s'affiche — c'est toujours mieux qu'un dessin approchant. Sinon on
 * retombe sur l'écusson vectoriel accompagné du nom.
 */
export function Marque({
    className,
    hauteur = 'h-9',
}: {
    className?: string;
    hauteur?: string;
}) {
    const { shop } = usePage<MarqueShared>().props;

    if (shop.logo) {
        return (
            <img
                src={shop.logo}
                alt={shop.name}
                className={cn('w-auto object-contain', hauteur, className)}
            />
        );
    }

    return (
        <span className={cn('flex items-center gap-2.5', className)}>
            <AppLogoIcon className={cn('aspect-square', hauteur)} />
            <span className="text-lg leading-none font-extrabold tracking-tight uppercase">
                {shop.name}
            </span>
        </span>
    );
}
