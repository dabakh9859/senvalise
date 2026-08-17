import { motion, useReducedMotion } from 'motion/react';
import type { Transition } from 'motion/react';
import { createElement } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Le vocabulaire de mouvement de la vitrine.
 *
 * Un seul endroit décide de la façon dont les choses entrent. Sans ça, chaque
 * page réinvente sa durée et sa courbe, et le site finit par bouger de dix
 * manières différentes — ce qui se remarque bien plus qu'une animation ratée.
 *
 * Pourquoi du JavaScript alors que le CSS savait déjà le faire : les
 * révélations s'appuyaient sur `animation-timeline: view()`, que Firefox
 * n'implémente pas. La page y restait correcte, mais parfaitement immobile.
 * Le mouvement était donc réservé à une partie des visiteurs. Ici il est le
 * même partout.
 *
 * Trois règles tenues dans tout le fichier :
 *
 * 1. On n'anime que `transform` et `opacity`. Ce sont les deux seules
 *    propriétés que le compositeur traite sans repasser par la mise en page ;
 *    animer une hauteur ou une marge fait recalculer la page à chaque image.
 * 2. Rien ne dure plus de 600 ms. Une vitrine doit donner envie, pas faire
 *    patienter.
 * 3. `prefers-reduced-motion` coupe tout, sans exception. Ce réglage est posé
 *    par des gens sujets au vertige ou à la migraine : il ne se négocie pas,
 *    et il ne se contourne pas non plus « juste pour le héros ».
 */

/**
 * Le ressort commun.
 *
 * Un ressort plutôt qu'une courbe fixe : l'élément décélère selon sa distance
 * restante, ce qui donne le poids qu'une durée constante ne donne jamais.
 * L'amortissement est volontairement haut — on veut l'inertie, pas le rebond.
 * Un rebond sur une fiche produit, c'est joli deux fois puis c'est fatigant.
 */
export const RESSORT: Transition = {
    type: 'spring',
    stiffness: 240,
    damping: 30,
    mass: 0.9,
};

/** Pour ce qui doit juste apparaître, sans élan. */
export const FONDU: Transition = {
    duration: 0.45,
    ease: [0.22, 1, 0.36, 1],
};

/**
 * D'où vient l'élément.
 *
 * Les décalages restent petits. Un élément qui traverse la moitié de l'écran
 * attire l'attention sur son déplacement au lieu de la porter sur son
 * contenu — et sur un téléphone, il déclenche une barre de défilement
 * horizontale le temps de l'animation.
 */
const DEPUIS = {
    bas: { x: 0, y: 22 },
    gauche: { x: -26, y: 0 },
    droite: { x: 26, y: 0 },
    /* Ni translation ni échelle : le contenu se contente de se révéler. */
    surplace: { x: 0, y: 0 },
} as const;

type Depuis = keyof typeof DEPUIS;

/**
 * Les balises que la révélation sait porter.
 *
 * Une carte fermée plutôt qu'un composant générique : la révélation doit
 * pouvoir s'appliquer directement sur le `h2` ou le `li` existant. L'envelopper
 * dans un `div` neutre casserait les grilles et les listes — un `div` inséré
 * entre un `ul` et ses `li` fait perdre à la liste sa sémantique, et à la
 * grille son alignement.
 */
const BALISES = {
    div: motion.div,
    section: motion.section,
    article: motion.article,
    figure: motion.figure,
    ul: motion.ul,
    ol: motion.ol,
    li: motion.li,
    h1: motion.h1,
    h2: motion.h2,
    h3: motion.h3,
    p: motion.p,
    span: motion.span,
    a: motion.a,
} as const;

type Balise = keyof typeof BALISES;

/**
 * Les attributs que ces composants relaient.
 *
 * Volontairement court. Étendre les props d'un `div` ne marche pas ici : la
 * balise est variable, et surtout `onDrag` n'a pas la même signature chez
 * React et chez motion — les deux types entrent en collision dès qu'on les
 * réunit. Plutôt qu'un cast qui masquerait le problème, on n'accepte que ce
 * dont la vitrine se sert réellement.
 */
type Commun = {
    className?: string;
    style?: CSSProperties;
    id?: string;
    'aria-hidden'?: boolean;
};

type ReveleProps = Commun & {
    children: ReactNode;
    /** @default 'bas' */
    depuis?: Depuis;
    /** Retard en secondes, pour échelonner à la main. @default 0 */
    delai?: number;
    /** @default 'div' */
    balise?: Balise;
};

/**
 * Révèle son contenu quand il entre dans l'écran.
 *
 * `once: true` : une fois révélé, l'élément reste en place. Rejouer
 * l'animation à chaque passage transforme un aller-retour de défilement en
 * clignotement, et empêche de relire ce qu'on vient de lire.
 *
 * La marge négative en bas de la zone d'observation déclenche l'entrée un peu
 * avant que l'élément touche le bord : quand il arrive vraiment à l'écran, il
 * a déjà commencé son mouvement, et on ne le surprend pas en train de démarrer.
 */
export function Revele({
    children,
    depuis = 'bas',
    delai = 0,
    balise = 'div',
    ...reste
}: ReveleProps) {
    const reduit = useReducedMotion();
    const Balise = BALISES[balise];

    if (reduit) {
        return createElement(balise, reste, children);
    }

    return (
        <Balise
            initial={{ opacity: 0, ...DEPUIS[depuis] }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true, margin: '0px 0px -12% 0px' }}
            transition={{ ...RESSORT, delay: delai }}
            {...reste}
        >
            {children}
        </Balise>
    );
}

type CascadeProps = Commun & {
    children: ReactNode;
    /** Écart entre deux enfants, en secondes. @default 0.07 */
    pas?: number;
    /** Retard avant le premier enfant. @default 0 */
    delai?: number;
    /** @default 'div' */
    balise?: Balise;
};

/**
 * Fait entrer ses enfants l'un après l'autre.
 *
 * L'échelonnement est porté par le parent, pas par un retard calculé sur
 * l'index de chaque enfant : c'est ce qui permet d'ajouter ou de retirer un
 * produit d'une grille sans avoir à renuméroter quoi que ce soit.
 *
 * Le pas est court et le nombre d'enfants rarement grand ; au-delà d'une
 * douzaine, mieux vaut le réduire encore — une cascade qui dure plus d'une
 * seconde donne l'impression que la page peine à charger.
 */
export function Cascade({
    children,
    pas = 0.07,
    delai = 0,
    balise = 'div',
    ...reste
}: CascadeProps) {
    const reduit = useReducedMotion();
    const Balise = BALISES[balise];

    if (reduit) {
        return createElement(balise, reste, children);
    }

    return (
        <Balise
            initial="repos"
            whileInView="entree"
            viewport={{ once: true, margin: '0px 0px -12% 0px' }}
            variants={{
                repos: {},
                entree: {
                    transition: { staggerChildren: pas, delayChildren: delai },
                },
            }}
            {...reste}
        >
            {children}
        </Balise>
    );
}

type PalierProps = Commun & {
    children: ReactNode;
    /** @default 'bas' */
    depuis?: Depuis;
    /** @default 'div' */
    balise?: Balise;
};

/**
 * Un enfant de `Cascade`.
 *
 * Il ne décide pas de son propre retard : il hérite du rythme du parent. Un
 * `Palier` posé hors d'une `Cascade` ne s'anime pas — c'est voulu, ça rend
 * l'oubli visible en développement plutôt que silencieux en production.
 */
export function Palier({
    children,
    depuis = 'bas',
    balise = 'div',
    ...reste
}: PalierProps) {
    const reduit = useReducedMotion();
    const Balise = BALISES[balise];

    if (reduit) {
        return createElement(balise, reste, children);
    }

    return (
        <Balise
            variants={{
                repos: { opacity: 0, ...DEPUIS[depuis] },
                entree: { opacity: 1, x: 0, y: 0, transition: RESSORT },
            }}
            {...reste}
        >
            {children}
        </Balise>
    );
}
