import type { SVGAttributes } from 'react';

/**
 * L'écusson SenValise, repris de l'enseigne de la boutique.
 *
 * Un disque bleu cerclé de blanc, les deux barres de la poignée en haut, et
 * la valise stylisée en jaune d'or. Les couleurs sont écrites en dur plutôt
 * que reprises du thème : une marque ne change pas de couleur selon qu'on est
 * en mode clair ou sombre.
 *
 * Ce n'est pas le logo d'origine — une photo d'enseigne ne se convertit pas en
 * fichier vectoriel. Dès que le fichier de la marque est déposé dans
 * _Réglages → Boutique_, c'est lui qui s'affiche partout et ce dessin
 * s'efface.
 */
export default function AppLogoIcon({
    monochrome = false,
    ...props
}: SVGAttributes<SVGElement> & { monochrome?: boolean }) {
    const bleu = monochrome ? 'currentColor' : '#1e3fa8';
    const or = monochrome ? 'currentColor' : '#f2b01e';

    return (
        <svg
            viewBox="0 0 64 64"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="SenValise"
            {...props}
        >
            <circle cx="32" cy="32" r="31" fill={bleu} />
            <circle
                cx="32"
                cy="32"
                r="27.5"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                opacity={monochrome ? 0.35 : 0.9}
            />

            {/* Les deux barres de l'enseigne, au-dessus de la valise */}
            <rect x="24" y="13" width="5.5" height="12" rx="2.4" fill="#ffffff" />
            <rect x="34.5" y="13" width="5.5" height="12" rx="2.4" fill="#ffffff" />

            {/* Corps de la valise */}
            <rect x="17" y="29" width="30" height="21" rx="4" fill={or} />

            {/* Sangles */}
            <rect x="25.5" y="29" width="3.2" height="21" fill={bleu} opacity="0.85" />
            <rect x="35.3" y="29" width="3.2" height="21" fill={bleu} opacity="0.85" />

            {/* Roulettes */}
            <rect x="22" y="50" width="5" height="3.2" rx="1.6" fill="#ffffff" />
            <rect x="37" y="50" width="5" height="3.2" rx="1.6" fill="#ffffff" />
        </svg>
    );
}
