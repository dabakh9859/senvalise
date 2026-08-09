import { useState } from 'react';
import { amount } from '@/lib/format';

export type BarRow = {
    label: string;
    value: number;
    detail?: string;
};

/**
 * Classement en barres horizontales.
 *
 * Une seule teinte : les barres se comparent par leur longueur, pas par leur
 * couleur. Les rangs ne sont pas des catégories — les repeindre ferait croire
 * à une identité qui change quand l'ordre change.
 */
export function BarList({
    rows,
    unit = 'FCFA',
}: {
    rows: BarRow[];
    unit?: string;
}) {
    const [hovered, setHovered] = useState<number | null>(null);
    const max = Math.max(...rows.map((row) => row.value), 1);

    return (
        <ul className="space-y-2.5 py-1">
            {rows.map((row, index) => (
                <li
                    key={row.label}
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    className="group"
                >
                    <div className="flex items-baseline justify-between gap-3">
                        <span
                            className="truncate text-xs transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                            title={row.label}
                        >
                            {row.label}
                        </span>
                        <span className="shrink-0 text-xs font-medium tabular-nums">
                            {amount(row.value)}
                            {hovered === index && row.detail ? (
                                <span className="ml-1.5 font-normal text-muted-foreground animate-in fade-in-0 slide-in-from-right-1 duration-150">
                                    {row.detail}
                                </span>
                            ) : null}
                        </span>
                    </div>

                    <div className="mt-1 h-2 w-full overflow-hidden rounded-[4px] bg-muted">
                        {/*
                         * La barre pousse depuis la gauche, en cascade du
                         * premier au dernier : on lit le classement dans
                         * l'ordre où il se dessine.
                         */}
                        <div
                            className="anim-barre-h h-full rounded-[4px] transition-[width] duration-300 ease-out"
                            style={{
                                width: `${Math.max((row.value / max) * 100, 2)}%`,
                                background: 'var(--viz-series-1)',
                                animationDelay: `${index * 45}ms`,
                            }}
                            aria-label={`${row.label} : ${amount(row.value)} ${unit}`}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
}
