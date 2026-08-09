import { useState } from 'react';
import { count } from '@/lib/format';

export type HeatmapRow = {
    day: string;
    cells: Array<{ hour: number; count: number }>;
};

/**
 * Affluence par jour et par heure.
 *
 * Une seule teinte, du plus clair au plus foncé : l'intensité dit le nombre de
 * ventes. Quatre paliers plutôt qu'un dégradé continu — l'œil compare des
 * paliers, il n'estime pas une nuance.
 */
export function Heatmap({
    rows,
    hours,
    max,
}: {
    rows: HeatmapRow[];
    hours: number[];
    max: number;
}) {
    const [hovered, setHovered] = useState<string | null>(null);

    if (max === 0) {
        return (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                Aucune vente sur la période.
            </div>
        );
    }

    return (
        <div className="space-y-3 py-1">
            <div className="overflow-x-auto">
                <div className="min-w-[320px] space-y-1">
                    {rows.map((row, rowIndex) => (
                        <div key={row.day} className="flex items-center gap-1">
                            <span className="w-8 shrink-0 text-[11px] text-muted-foreground">
                                {row.day}
                            </span>

                            <div className="flex flex-1 gap-1">
                                {row.cells.map((cell, column) => {
                                    const key = `${row.day}-${cell.hour}`;

                                    return (
                                        <div
                                            key={key}
                                            onMouseEnter={() =>
                                                setHovered(key)
                                            }
                                            onMouseLeave={() =>
                                                setHovered(null)
                                            }
                                            title={`${row.day} ${cell.hour} h — ${count(cell.count)} vente${cell.count > 1 ? 's' : ''}`}
                                            className="anim-cellule h-6 flex-1 rounded-[3px] transition-[background-color,transform] duration-150 ease-out hover:scale-110"
                                            style={{
                                                background: shade(
                                                    cell.count,
                                                    max,
                                                ),
                                                outline:
                                                    hovered === key
                                                        ? '2px solid var(--viz-axis)'
                                                        : undefined,
                                                outlineOffset: '-1px',
                                                // La grille se remplit en
                                                // diagonale, du lundi matin
                                                // au dimanche soir.
                                                animationDelay: `${(rowIndex + column) * 10}ms`,
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    <div className="flex items-center gap-1">
                        <span className="w-8 shrink-0" />
                        <div className="flex flex-1 gap-1">
                            {hours.map((hour) => (
                                <span
                                    key={hour}
                                    className="flex-1 text-center text-[10px] text-muted-foreground tabular-nums"
                                >
                                    {hour % 2 === 0 ? hour : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                Moins
                <span
                    className="size-3 rounded-[3px]"
                    style={{ background: 'var(--viz-grid)' }}
                />
                {[1, 2, 3, 4].map((level) => (
                    <span
                        key={level}
                        className="size-3 rounded-[3px]"
                        style={{ background: `var(--viz-seq-${level})` }}
                    />
                ))}
                Plus
            </div>
        </div>
    );
}

/** Quatre paliers d'intensité ; zéro reste au ton de la grille. */
function shade(value: number, max: number): string {
    if (value <= 0) {
        return 'var(--viz-grid)';
    }

    const level = Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));

    return `var(--viz-seq-${level})`;
}
