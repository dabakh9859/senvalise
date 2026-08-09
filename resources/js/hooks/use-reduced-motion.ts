import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * L'utilisateur a-t-il demandé moins d'animations ?
 *
 * Le CSS neutralise déjà les animations déclaratives ; ce hook sert à ce que
 * le JavaScript ne peut pas deviner — un compteur qui défile, par exemple,
 * doit afficher son résultat tout de suite plutôt que de compter en accéléré.
 */
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(
        () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
    );

    useEffect(() => {
        const query = window.matchMedia(QUERY);
        const update = (event: MediaQueryListEvent) => setReduced(event.matches);

        query.addEventListener('change', update);

        return () => query.removeEventListener('change', update);
    }, []);

    return reduced;
}
