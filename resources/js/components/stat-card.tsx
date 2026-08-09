import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info';

const iconToneClasses: Record<Tone, string> = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
    info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

/**
 * Tuile de chiffre clé : libellé, valeur, écart facultatif.
 *
 * La valeur garde les chiffres proportionnels de la police — `tabular-nums`
 * fait paraître un grand nombre trop aéré, il est réservé aux colonnes qui
 * doivent s'aligner.
 */
export function StatCard({
    label,
    value,
    hint,
    delta,
    deltaLabel,
    icon: Icon,
    tone = 'default',
    className,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    /** Écart en % face à la période précédente ; null si la comparaison n'a pas de sens. */
    delta?: number | null;
    deltaLabel?: string;
    icon?: LucideIcon;
    tone?: Tone;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm',
                className,
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                {Icon ? (
                    <span
                        className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-lg',
                            iconToneClasses[tone],
                        )}
                    >
                        <Icon className="size-4" />
                    </span>
                ) : null}
            </div>

            <div className="space-y-1">
                <p className="truncate text-2xl font-semibold">{value}</p>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {delta !== undefined && delta !== null ? (
                        <Delta value={delta} label={deltaLabel} />
                    ) : null}
                    {hint ? (
                        <p className="text-xs text-muted-foreground">{hint}</p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

/**
 * Écart signé.
 *
 * La flèche double la couleur : la direction reste lisible sans distinguer le
 * vert du rouge.
 */
export function Delta({ value, label }: { value: number; label?: string }) {
    const up = value >= 0;
    const Icon = up ? ArrowUpRight : ArrowDownRight;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium',
                up
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400',
            )}
        >
            <Icon className="size-3.5" />
            {up ? '+' : ''}
            {value.toString().replace('.', ',')} %
            {label ? (
                <span className="font-normal text-muted-foreground">
                    {' '}
                    {label}
                </span>
            ) : null}
        </span>
    );
}
