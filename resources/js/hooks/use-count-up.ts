import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * Fait défiler un nombre jusqu'à sa valeur.
 *
 * Au premier affichage il part de zéro ; ensuite il glisse de l'ancienne
 * valeur à la nouvelle, ce qui rend visible le sens du changement quand on
 * bascule de période. Les montants restent des entiers à chaque image : en
 * francs CFA, une décimale qui clignote n'aurait aucun sens.
 */
export function useCountUp(value: number, duration = 650): number {
    const reduced = useReducedMotion();
    const [display, setDisplay] = useState(0);
    const from = useRef(0);

    useEffect(() => {
        const start = from.current;
        const distance = value - start;

        from.current = value;

        if (distance === 0) {
            return;
        }

        const total = reduced ? 0 : duration;
        const startedAt = performance.now();
        let frame = 0;

        const tick = (now: number) => {
            const progress =
                total <= 0 ? 1 : Math.min((now - startedAt) / total, 1);

            // Décélération : l'essentiel du chemin est fait tôt, la fin se pose.
            const eased = 1 - (1 - progress) ** 3;

            setDisplay(Math.round(start + distance * eased));

            if (progress < 1) {
                frame = requestAnimationFrame(tick);
            }
        };

        frame = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(frame);
    }, [value, duration, reduced]);

    return display;
}
