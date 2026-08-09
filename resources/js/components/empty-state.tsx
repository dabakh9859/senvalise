import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Message affiché quand une liste ne renvoie rien. */
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
}: {
    icon?: LucideIcon;
    title: string;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'anim-entree flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
                className,
            )}
        >
            {Icon ? (
                <span
                    className="anim-cellule flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    style={{ animationDelay: '80ms' }}
                >
                    <Icon className="size-5" />
                </span>
            ) : null}
            <div className="space-y-1">
                <p className="font-medium">{title}</p>
                {description ? (
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {action}
        </div>
    );
}
