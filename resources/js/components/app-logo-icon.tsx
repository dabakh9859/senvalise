import type { SVGAttributes } from 'react';

/**
 * L'écusson SenValise.
 *
 * Un disque terre cuite cerclé de clair, les deux barres de la poignée en
 * haut, et la valise stylisée en sable. Les couleurs sont écrites en dur
 * plutôt que reprises du thème : une marque ne change pas de couleur selon
 * qu'on est en mode clair ou sombre.
 *
 * Ce n'est pas le logo d'origine — une photo d'enseigne ne se convertit pas en
 * fichier vectoriel. Dès que le fichier de la marque est déposé dans
 * _Réglages → Boutique_, c'est lui qui s'affiche partout et ce dessin
 * s'efface. Il suit donc la direction du site plutôt que l'inverse : c'est un
 * substitut, pas l'enseigne.
 */
export default function AppLogoIcon({
    monochrome = false,
    ...props
}: SVGAttributes<SVGElement> & { monochrome?: boolean }) {
    const terre = monochrome ? 'currentColor' : '#af4e2a';
    const sable = monochrome ? 'currentColor' : '#ede4d4';
    const braise = monochrome ? 'currentColor' : '#8c3c1f';
    const papier = monochrome ? '#ffffff' : '#f7f3ea';

    return (
        <svg
            viewBox="0 0 64 64"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="SenValise"
            {...props}
        >
            <circle cx="32" cy="32" r="31" fill={terre} />
            <circle
                cx="32"
                cy="32"
                r="27.5"
                fill="none"
                stroke={papier}
                strokeWidth="2"
                opacity={monochrome ? 0.35 : 0.9}
            />

            {/* Les deux barres de l'enseigne, au-dessus de la valise */}
            <rect
                x="24"
                y="13"
                width="5.5"
                height="12"
                rx="2.4"
                fill={papier}
            />
            <rect
                x="34.5"
                y="13"
                width="5.5"
                height="12"
                rx="2.4"
                fill={papier}
            />

            {/* Corps de la valise */}
            <rect x="17" y="29" width="30" height="21" rx="4" fill={sable} />

            {/* Sangles */}
            <rect
                x="25.5"
                y="29"
                width="3.2"
                height="21"
                fill={braise}
                opacity="0.85"
            />
            <rect
                x="35.3"
                y="29"
                width="3.2"
                height="21"
                fill={braise}
                opacity="0.85"
            />

            {/* Roulettes */}
            <rect x="22" y="50" width="5" height="3.2" rx="1.6" fill={papier} />
            <rect x="37" y="50" width="5" height="3.2" rx="1.6" fill={papier} />
        </svg>
    );
}
