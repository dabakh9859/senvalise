import { PackageSearch } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { amount } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { VariantOption } from '@/types/senvalise';

/**
 * Sélecteur d'article avec recherche.
 *
 * Le catalogue est déjà chargé côté navigateur : le filtrage est instantané
 * et fonctionne aussi bien à la saisie qu'au scan d'un code-barres (la
 * douchette tape le code puis valide).
 */
export function VariantPicker({
    variants,
    onSelect,
    placeholder = 'Rechercher un article (nom, référence ou code-barres)…',
    excludeIds = [],
    autoFocus = false,
    className,
}: {
    variants: VariantOption[];
    onSelect: (variant: VariantOption) => void;
    placeholder?: string;
    excludeIds?: number[];
    autoFocus?: boolean;
    className?: string;
}) {
    const [term, setTerm] = useState('');
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

    const results = useMemo(() => {
        const needle = term.trim().toLowerCase();

        if (needle.length === 0) {
            return [];
        }

        return variants
            .filter((variant) => {
                if (excluded.has(variant.id)) {
                    return false;
                }

                return (
                    variant.label.toLowerCase().includes(needle) ||
                    variant.sku.toLowerCase().includes(needle) ||
                    (variant.barcode ?? '').includes(needle)
                );
            })
            .slice(0, 12);
    }, [term, variants, excluded]);

    const choose = (variant: VariantOption) => {
        onSelect(variant);
        setTerm('');
        setOpen(false);
        setHighlighted(0);
        inputRef.current?.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlighted((index) => Math.min(index + 1, results.length - 1));

            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlighted((index) => Math.max(index - 1, 0));

            return;
        }

        if (event.key === 'Escape') {
            setOpen(false);

            return;
        }

        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();

        // Un code-barres scanné en entier doit tomber pile sur son article,
        // même si la liste propose d'autres résultats approchants.
        const needle = term.trim();
        const exact = variants.find(
            (variant) => variant.barcode === needle || variant.sku === needle,
        );

        if (exact && !excluded.has(exact.id)) {
            choose(exact);

            return;
        }

        if (results[highlighted]) {
            choose(results[highlighted]);
        }
    };

    return (
        <div className={cn('relative', className)}>
            <PackageSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                ref={inputRef}
                value={term}
                autoFocus={autoFocus}
                onChange={(event) => {
                    setTerm(event.target.value);
                    setOpen(true);
                    setHighlighted(0);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="pl-8"
            />

            {open && results.length > 0 ? (
                <ul className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                    {results.map((variant, index) => (
                        <li key={variant.id}>
                            <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setHighlighted(index)}
                                onClick={() => choose(variant)}
                                className={cn(
                                    'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm',
                                    index === highlighted
                                        ? 'bg-accent text-accent-foreground'
                                        : 'hover:bg-accent/60',
                                )}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate">
                                        {variant.label}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {variant.sku}
                                        {variant.barcode
                                            ? ` · ${variant.barcode}`
                                            : ''}
                                    </span>
                                </span>
                                <span className="shrink-0 text-right text-xs">
                                    <span className="block font-medium tabular-nums">
                                        {amount(
                                            variant.price ??
                                                variant.sellingPrice ??
                                                0,
                                        )}
                                    </span>
                                    <span
                                        className={cn(
                                            'block tabular-nums',
                                            variant.stock > 0
                                                ? 'text-muted-foreground'
                                                : 'text-red-600 dark:text-red-400',
                                        )}
                                    >
                                        {variant.stock} en stock
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

            {open && term.trim().length > 0 && results.length === 0 ? (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover px-3 py-3 text-sm text-muted-foreground shadow-md">
                    Aucun article ne correspond à « {term.trim()} ».
                </div>
            ) : null}
        </div>
    );
}
