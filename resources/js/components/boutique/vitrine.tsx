import { Link } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Décalage de cascade pour `.anim-revele`.
 *
 * Les éléments d'une rangée entrent tous ensemble dans l'écran : sans ce
 * décalage ils apparaîtraient d'un bloc. Il est plafonné, sinon le dernier
 * carreau d'une grille de douze attendrait d'avoir presque traversé l'écran
 * avant de se montrer.
 */
export function cascade(index: number, plafond = 5): CSSProperties {
    return {
        '--pas': `${Math.min(index, plafond) * 4}%`,
    } as CSSProperties;
}

/**
 * Les pièces communes de la vitrine.
 *
 * Trois éléments reviennent sur toutes les pages : l'en-tête de section
 * (surtitre → titre → sous-titre), le bouton d'action, et le rail horizontal
 * de produits. Les rassembler ici évite que chaque page réinvente son propre
 * interlettrage.
 */

export function SectionHeader({
    kicker,
    title,
    subtitle,
    align = 'left',
    action,
}: {
    kicker?: string;
    title: string;
    subtitle?: string;
    align?: 'left' | 'center';
    action?: ReactNode;
}) {
    return (
        <div
            className={cn(
                'flex flex-wrap items-end justify-between gap-4',
                align === 'center' && 'flex-col items-center text-center',
            )}
        >
            <div className={cn('space-y-3', align === 'center' && 'max-w-2xl')}>
                {kicker ? (
                    /*
                     * Le filet doré, c'est le seul endroit où la couleur du
                     * logo sert vraiment. Elle ne porte jamais de texte — à
                     * 1,9:1 sur fond clair elle serait illisible — mais en
                     * trait de 1 px elle marque chaque début de chapitre.
                     */
                    <p
                        className={cn(
                            'vitrine-surtitre anim-revele flex items-center gap-3 text-[var(--vitrine-encre)]/50',
                            align === 'center' && 'justify-center',
                        )}
                    >
                        <span
                            aria-hidden
                            className="h-px w-6 bg-[var(--vitrine-or)]"
                        />
                        {kicker}
                    </p>
                ) : null}
                <h2 style={cascade(1)} className="vitrine-titre anim-revele">
                    {title}
                </h2>
                {subtitle ? (
                    <p
                        style={cascade(2)}
                        className="vitrine-texte anim-revele max-w-xl text-[15px] leading-relaxed text-[var(--vitrine-encre)]/60 sm:text-base"
                    >
                        {subtitle}
                    </p>
                ) : null}
            </div>
            {action ? (
                <div style={cascade(2)} className="anim-revele">
                    {action}
                </div>
            ) : null}
        </div>
    );
}

/**
 * Bouton d'action de la vitrine : rectangulaire, en capitales espacées.
 *
 * Il ne réutilise pas le bouton du logiciel de gestion — celui-ci est arrondi
 * et discret, ce qui est juste pour une caisse et faux pour une devanture.
 */
export function ShopButton({
    href,
    onClick,
    children,
    variant = 'primary',
    className,
    type = 'button',
    disabled,
}: {
    href?: string;
    onClick?: () => void;
    children: ReactNode;
    /**
     * `pilule` est l'action principale de la vitrine, `verre` sa compagne
     * translucide. Aucun n'est arrondi : la boutique est à angles vifs.
     */
    variant?: 'primary' | 'inverse' | 'outline' | 'pilule' | 'verre';
    className?: string;
    type?: 'button' | 'submit';
    disabled?: boolean;
}) {
    const plein = variant === 'pilule' || variant === 'verre';

    const classes = cn(
        'inline-flex items-center justify-center gap-2.5 transition-[background-color,color,border-color,transform,opacity,box-shadow] duration-200 ease-out outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--vitrine-bleu)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        plein
            ? 'px-7 py-3.5 text-sm font-medium'
            : 'vitrine-libelle px-7 py-3.5',
        variant === 'primary' &&
            'bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500',
        variant === 'inverse' && 'bg-white text-neutral-900 hover:bg-white/90',
        variant === 'outline' &&
            'border border-current bg-transparent hover:bg-foreground hover:text-background',
        /*
         * L'action principale porte une ombre teintée de sa propre couleur
         * plutôt qu'un gris : c'est ce qui la décolle du fond sans qu'elle
         * paraisse posée sur du carton.
         */
        variant === 'pilule' &&
            'bg-[var(--vitrine-bleu)] text-white shadow-[0_10px_28px_-14px_var(--vitrine-bleu)] hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-14px_var(--vitrine-bleu)]',
        variant === 'verre' &&
            'verre text-[var(--vitrine-encre)] hover:opacity-80',
        className,
    );

    if (href) {
        return (
            <Link href={href} className={classes}>
                {children}
            </Link>
        );
    }

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={classes}
        >
            {children}
        </button>
    );
}

/**
 * Rail horizontal de produits.
 *
 * Le défilement natif fait le travail — au doigt sur téléphone, à la molette
 * sur ordinateur. Les flèches ne font que le piloter : une bibliothèque de
 * carrousel apporterait 40 ko pour remplacer trois lignes de `scrollBy`.
 */
export function Rail({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    const rail = useRef<HTMLDivElement>(null);

    function scroll(direction: -1 | 1) {
        const node = rail.current;

        if (!node) {
            return;
        }

        // Un peu moins que la largeur visible : la carte suivante reste
        // amorcée à l'écran, ce qui montre qu'il y a une suite.
        node.scrollBy({
            left: direction * node.clientWidth * 0.8,
            behavior: 'smooth',
        });
    }

    /*
     * `anim-revele` va sur l'enveloppe, jamais sur les cartes : la piste est
     * un conteneur de défilement, et `view()` s'y accrocherait au lieu de
     * s'accrocher à la page.
     */
    return (
        <div className={cn('anim-revele relative', className)}>
            <div className="mb-4 flex justify-end gap-2">
                <RailButton
                    onClick={() => scroll(-1)}
                    label="Précédent"
                    icon={<ChevronLeft className="size-4" />}
                />
                <RailButton
                    onClick={() => scroll(1)}
                    label="Suivant"
                    icon={<ChevronRight className="size-4" />}
                />
            </div>

            <div
                ref={rail}
                /* La piste déborde jusqu'au bord de l'écran sur téléphone :
                   une carte coupée par le bord dit « ça continue » mieux
                   qu'une flèche. Le retrait suit la gouttière de `Section`. */
                className="-mx-5 flex snap-x snap-mandatory [scrollbar-width:none] gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
                {children}
            </div>
        </div>
    );
}

function RailButton({
    onClick,
    label,
    icon,
}: {
    onClick: () => void;
    label: string;
    icon: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="flex size-10 items-center justify-center border transition-[background-color,color,transform] duration-150 ease-out hover:bg-foreground hover:text-background active:scale-95"
        >
            {icon}
        </button>
    );
}

/**
 * Section pleine largeur avec la gouttière commune de la vitrine.
 *
 * Le rythme vertical est généreux — c'est le blanc entre les chapitres qui
 * fait qu'une page longue se lit comme une suite de chapitres et non comme
 * une liste. Trop serré, tout se confond.
 */
export function Section({
    children,
    className,
    wide,
}: {
    children: ReactNode;
    className?: string;
    wide?: boolean;
}) {
    return (
        <section
            className={cn(
                'mx-auto px-5 py-16 sm:px-8 sm:py-24',
                wide ? 'max-w-[1600px]' : 'max-w-6xl',
                className,
            )}
        >
            {children}
        </section>
    );
}
