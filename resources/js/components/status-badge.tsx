import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { StatusTone } from '@/types/senvalise';

const toneClasses: Record<StatusTone, string> = {
    neutral: 'bg-muted text-muted-foreground border-transparent',
    info: 'bg-blue-500/12 text-blue-700 dark:text-blue-300 border-transparent',
    success:
        'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-transparent',
    warning:
        'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent',
    danger: 'bg-red-500/12 text-red-700 dark:text-red-300 border-transparent',
};

/** Pastille de statut, déclinée en clair et en sombre. */
export function StatusBadge({
    label,
    tone = 'neutral',
    className,
}: {
    label: string;
    tone?: StatusTone;
    className?: string;
}) {
    return (
        <Badge className={cn(toneClasses[tone], 'font-medium', className)}>
            {label}
        </Badge>
    );
}
