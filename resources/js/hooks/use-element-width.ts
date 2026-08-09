import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Largeur réelle d'un élément, suivie au redimensionnement.
 *
 * Les graphiques sont dessinés en pixels plutôt qu'à l'échelle d'un viewBox :
 * c'est la seule façon de garder un trait à 2 px et un texte à sa taille quelle
 * que soit la largeur de la carte.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const element = ref.current;

        if (!element) {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];

            if (entry) {
                setWidth(entry.contentRect.width);
            }
        });

        observer.observe(element);
        setWidth(element.getBoundingClientRect().width);

        return () => observer.disconnect();
    }, [ref]);

    return width;
}
