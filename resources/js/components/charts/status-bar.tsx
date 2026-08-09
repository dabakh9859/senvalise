import { CheckCircle2, CircleDashed, CircleDot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { count, money } from '@/lib/format';

export type StatusSlice = {
    key: string;
    label: string;
    tone: 'good' | 'warning' | 'critical';
    count: number;
    amount: number;
};

const TONE: Record<StatusSlice['tone'], { color: string; icon: LucideIcon }> = {
    good: { color: 'var(--viz-good)', icon: CheckCircle2 },
    warning: { color: 'var(--viz-warning)', icon: CircleDot },
    critical: { color: 'var(--viz-critical)', icon: CircleDashed },
};

/**
 * Répartition des factures par état de règlement.
 *
 * Les couleurs d'état ne portent jamais l'information seules : chaque part est
 * reprise en dessous avec son icône, son libellé et son montant.
 */
export function StatusBar({ slices }: { slices: StatusSlice[] }) {
    const total = slices.reduce((sum, slice) => sum + slice.count, 0);

    if (total === 0) {
        return (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                Aucune facture émise sur la période.
            </div>
        );
    }

    const visible = slices.filter((slice) => slice.count > 0);

    return (
        <div className="space-y-4 py-2">
            {/*
             * 2 px de fond entre les segments : la frontière se lit sans trait.
             * La barre entière se déploie d'un seul geste vers la droite — un
             * segment qui grandirait chacun de son côté donnerait trois
             * mouvements là où il n'y a qu'une répartition.
             */}
            <div className="anim-barre-h flex h-3 w-full gap-0.5 overflow-hidden">
                {visible.map((slice) => (
                    <div
                        key={slice.key}
                        title={`${slice.label} : ${count(slice.count)}`}
                        className="h-full transition-[width] duration-300 ease-out first:rounded-l-[4px] last:rounded-r-[4px]"
                        style={{
                            width: `${(slice.count / total) * 100}%`,
                            background: TONE[slice.tone].color,
                        }}
                    />
                ))}
            </div>

            <ul className="space-y-2">
                {slices.map((slice, index) => {
                    const Icon = TONE[slice.tone].icon;
                    const share = Math.round((slice.count / total) * 100);

                    return (
                        <li
                            key={slice.key}
                            className="anim-entree flex items-center justify-between gap-3"
                            style={{ animationDelay: `${200 + index * 60}ms` }}
                        >
                            <span className="flex min-w-0 items-center gap-2 text-xs">
                                <Icon
                                    className="size-3.5 shrink-0"
                                    style={{ color: TONE[slice.tone].color }}
                                />
                                <span className="truncate">
                                    {count(slice.count)} facture
                                    {slice.count > 1 ? 's' : ''} {slice.label}
                                </span>
                            </span>

                            <span className="shrink-0 text-xs tabular-nums">
                                <span className="font-medium">
                                    {money(slice.amount)}
                                </span>
                                <span className="ml-1.5 text-muted-foreground">
                                    {share} %
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
