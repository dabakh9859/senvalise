import { ChevronDown, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Le tableau jumeau d'un graphique.
 *
 * Chaque carte en propose un : une courbe se lit d'un coup d'œil, mais le
 * chiffre exact doit rester accessible sans la souris — au lecteur d'écran
 * comme à celui qui veut recopier un montant.
 */
export type TableView = {
    head: string[];
    rows: Array<{ key: string; cells: ReactNode[] }>;
};

export function ChartCard({
    title,
    description,
    legend,
    action,
    table,
    delay = 0,
    children,
    className,
}: {
    title: string;
    description?: ReactNode;
    /** Légende, obligatoire dès deux séries. */
    legend?: ReactNode;
    action?: ReactNode;
    table?: TableView;
    /** Décalage d'entrée en ms, pour que les cartes arrivent en cascade. */
    delay?: number;
    children: ReactNode;
    className?: string;
}) {
    const [showTable, setShowTable] = useState(false);

    return (
        <section
            style={{ animationDelay: `${delay}ms` }}
            className={cn(
                'anim-entree flex flex-col rounded-xl border bg-card shadow-sm transition-shadow duration-200 hover:shadow-md',
                className,
            )}
        >
            <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3">
                <div className="min-w-0 space-y-0.5">
                    <h2 className="text-sm font-semibold tracking-tight">
                        {title}
                    </h2>
                    {description ? (
                        <p className="text-xs text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>

                {legend || action ? (
                    <div className="flex shrink-0 items-center gap-3">
                        {legend}
                        {action}
                    </div>
                ) : null}
            </header>

            <div className="flex-1 px-4 pb-1">{children}</div>

            {table ? (
                <footer className="px-2 pb-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTable((open) => !open)}
                        aria-expanded={showTable}
                        className="h-7 text-xs font-normal text-muted-foreground"
                    >
                        <Table2 className="size-3.5" />
                        {showTable
                            ? 'Masquer les valeurs'
                            : 'Voir les valeurs'}
                        <ChevronDown
                            className={cn(
                                'size-3.5 transition-transform duration-200 ease-out',
                                showTable && 'rotate-180',
                            )}
                        />
                    </Button>

                    {/*
                     * Deux lignes de grille plutôt qu'une hauteur mesurée : le
                     * tableau se déplie et se replie vers sa hauteur réelle,
                     * sans que personne ait à la calculer.
                     */}
                    <div
                        className={cn(
                            'grid transition-[grid-template-rows] duration-200 ease-out',
                            showTable ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                        )}
                    >
                        <div className="overflow-hidden">
                            <div className="mx-2 mt-1 max-h-64 overflow-y-auto rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {table.head.map((label, index) => (
                                                <TableHead
                                                    key={label}
                                                    className={cn(
                                                        'h-8 text-xs',
                                                        index > 0 &&
                                                            'text-right',
                                                    )}
                                                >
                                                    {label}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {table.rows.map((row) => (
                                            <TableRow key={row.key}>
                                                {row.cells.map(
                                                    (cell, index) => (
                                                        <TableCell
                                                            key={index}
                                                            className={cn(
                                                                'py-1.5 text-xs',
                                                                index > 0 &&
                                                                    'text-right tabular-nums',
                                                            )}
                                                        >
                                                            {cell}
                                                        </TableCell>
                                                    ),
                                                )}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                </footer>
            ) : null}
        </section>
    );
}

/** Pastille de légende : la couleur est nommée, jamais laissée seule. */
export function LegendItem({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{ background: color }}
            />
            {label}
        </span>
    );
}

/** Ce qu'affiche une carte quand il n'y a encore rien à montrer. */
export function ChartEmpty({ message }: { message: string }) {
    return (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
            {message}
        </div>
    );
}
