import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Barre de filtres : recherche à gauche, sélecteurs à droite. */
export function FilterBar({
    search,
    onSearch,
    placeholder = 'Rechercher…',
    onReset,
    isFiltered,
    children,
    className,
}: {
    search?: string;
    onSearch?: (value: string) => void;
    placeholder?: string;
    onReset?: () => void;
    isFiltered?: boolean;
    children?: ReactNode;
    className?: string;
}) {
    return (
        // Sur téléphone la recherche prend toute la largeur et les sélecteurs
        // se rangent deux par deux ; à partir de la tablette tout tient sur une
        // ligne. Sans cela, deux sélecteurs de 176 px débordent d'un écran de
        // 375 px.
        <div
            className={cn(
                'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center',
                className,
            )}
        >
            {onSearch ? (
                <div className="relative w-full sm:min-w-52 sm:max-w-xs sm:flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search ?? ''}
                        onChange={(event) => onSearch(event.target.value)}
                        placeholder={placeholder}
                        className="h-10 pl-8 sm:h-9"
                    />
                </div>
            ) : null}

            {children ? (
                <div className="grid grid-cols-2 gap-2 sm:contents">
                    {children}
                </div>
            ) : null}

            {/* Le bouton apparaît en glissant : il signale qu'un filtre est actif */}
            {isFiltered && onReset ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onReset}
                    className="text-muted-foreground animate-in fade-in-0 slide-in-from-left-2 duration-200"
                >
                    <X className="size-4" />
                    Réinitialiser
                </Button>
            ) : null}
        </div>
    );
}

/**
 * Sélecteur de filtre. Radix n'accepte pas la valeur vide pour un item :
 * on utilise une valeur sentinelle « tous » traduite en chaîne vide.
 */
export function FilterSelect({
    value,
    onChange,
    options,
    allLabel,
    className,
    width = 'sm:w-44',
}: {
    value?: string | number;
    onChange: (value: string) => void;
    options: Array<{ value: string | number; label: string }>;
    allLabel: string;
    className?: string;
    /**
     * Largeur à partir de la tablette, préfixe compris (« sm:w-40 ») : Tailwind
     * ne voit que les classes écrites en toutes lettres dans les sources, une
     * classe construite à l'exécution ne serait jamais générée.
     */
    width?: string;
}) {
    const ALL = '__tous__';

    return (
        <Select
            value={value === undefined || value === '' ? ALL : String(value)}
            onValueChange={(next) => onChange(next === ALL ? '' : next)}
        >
            {/* Pleine largeur dans la grille du téléphone, largeur fixe ensuite */}
            <SelectTrigger
                className={cn('h-10 w-full sm:h-8', width, className)}
                size="sm"
            >
                <SelectValue placeholder={allLabel} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{allLabel}</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
