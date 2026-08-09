import { router } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';

export type FilterValues = Record<string, string | number | undefined | null>;

/**
 * Filtres de liste synchronisés avec l'URL.
 *
 * La saisie au clavier est temporisée (300 ms) pour ne pas déclencher une
 * requête à chaque lettre ; les listes déroulantes partent immédiatement.
 * L'URL reste partageable et le bouton « précédent » du navigateur fonctionne.
 */
export function useFilters<T extends FilterValues>(url: string, initial: T) {
    const [values, setValues] = useState<T>(initial);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRender = useRef(true);

    const visit = useCallback(
        (next: T) => {
            const query: Record<string, string> = {};

            for (const [key, value] of Object.entries(next)) {
                if (value !== undefined && value !== null && value !== '') {
                    query[key] = String(value);
                }
            }

            router.get(url, query, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
            });
        },
        [url],
    );

    useEffect(() => {
        return () => {
            if (timer.current) {
                clearTimeout(timer.current);
            }
        };
    }, []);

    /** Met à jour un filtre. `immediate` évite d'attendre pour les sélecteurs. */
    const set = useCallback(
        (
            key: keyof T,
            value: string | number | undefined,
            immediate = false,
        ) => {
            setValues((current) => {
                const next = { ...current, [key]: value } as T;

                if (timer.current) {
                    clearTimeout(timer.current);
                }

                if (immediate) {
                    visit(next);
                } else {
                    timer.current = setTimeout(() => visit(next), 300);
                }

                return next;
            });
        },
        [visit],
    );

    const reset = useCallback(() => {
        const cleared = Object.fromEntries(
            Object.keys(values).map((key) => [key, '']),
        ) as T;

        setValues(cleared);

        if (timer.current) {
            clearTimeout(timer.current);
        }

        visit(cleared);
    }, [values, visit]);

    // Si la navigation vient d'ailleurs (lien, retour arrière), on se recale
    // sur ce que le serveur renvoie.
    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;

            return;
        }

        setValues(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(initial)]);

    const isFiltered = Object.values(values).some(
        (value) => value !== undefined && value !== null && value !== '',
    );

    return { values, set, reset, isFiltered };
}
