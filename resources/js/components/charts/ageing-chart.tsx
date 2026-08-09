import { useState } from 'react';
import { amount } from '@/lib/format';

export type AgeingBucket = {
    key: string;
    label: string;
    amount: number;
    count: number;
};

const PLOT_HEIGHT = 132;

/**
 * Créances par ancienneté.
 *
 * Les tranches d'âge sont ordonnées, pas des catégories : la rampe va du clair
 * au foncé, si bien que le plus vieil impayé — celui qu'il faut relancer — est
 * aussi le plus marqué à l'œil.
 */
export function AgeingChart({ buckets }: { buckets: AgeingBucket[] }) {
    const [hovered, setHovered] = useState<string | null>(null);
    const max = Math.max(...buckets.map((bucket) => bucket.amount), 1);

    return (
        <div className="flex items-end gap-2 pt-2">
            {buckets.map((bucket, index) => {
                const active = hovered === bucket.key;
                const height = Math.round((bucket.amount / max) * PLOT_HEIGHT);

                return (
                    <div
                        key={bucket.key}
                        onMouseEnter={() => setHovered(bucket.key)}
                        onMouseLeave={() => setHovered(null)}
                        className="flex flex-1 flex-col items-center gap-1.5"
                    >
                        <span className="text-[11px] font-medium tabular-nums">
                            {bucket.amount > 0 ? amount(bucket.amount) : '—'}
                        </span>

                        <div
                            className="flex w-full items-end justify-center"
                            style={{ height: PLOT_HEIGHT }}
                        >
                            {/* La barre monte depuis la ligne de base, de la
                                tranche la plus récente à la plus ancienne. */}
                            <div
                                className="anim-barre-v w-full max-w-6 rounded-t-[4px] transition-[height,opacity] duration-200 ease-out"
                                style={{
                                    height: Math.max(
                                        height,
                                        bucket.amount > 0 ? 3 : 2,
                                    ),
                                    background:
                                        bucket.amount > 0
                                            ? `var(--viz-seq-${index + 1})`
                                            : 'var(--viz-grid)',
                                    opacity:
                                        hovered && !active ? 0.55 : undefined,
                                    animationDelay: `${index * 70}ms`,
                                }}
                            />
                        </div>

                        <div className="border-t border-[var(--viz-grid)] pt-1.5 text-center">
                            <p className="text-[11px] text-muted-foreground">
                                {bucket.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground tabular-nums">
                                {bucket.count} facture
                                {bucket.count > 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
