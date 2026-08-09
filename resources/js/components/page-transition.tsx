import { usePage } from '@inertiajs/react';
import type { PropsWithChildren } from 'react';

/**
 * Entrée de page.
 *
 * La clé est le nom du composant, pas l'adresse : filtrer une liste ou changer
 * de page de résultats modifie l'URL sans changer d'écran. Rejouer l'animation
 * à chaque lettre tapée relancerait le composant et ferait perdre le focus du
 * champ de recherche — c'est l'écran qui s'anime, pas son contenu.
 */
export function PageTransition({ children }: PropsWithChildren) {
    const { component } = usePage();

    return (
        <div key={component} className="anim-page flex flex-1 flex-col">
            {children}
        </div>
    );
}
