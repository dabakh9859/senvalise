import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** En-tête de page : titre, sous-titre et boutons d'action alignés à droite. */
export function PageHeader({
    title,
    description,
    actions,
    className,
}: {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
                className,
            )}
        >
            <div className="min-w-0 space-y-1">
                <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                    {title}
                </h1>
                {description ? (
                    // Le sous-titre explique, il n'informe pas : sur téléphone
                    // il céderait la place au contenu.
                    <p className="hidden text-sm text-muted-foreground sm:block">
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? (
                // Les boutons occupent toute la largeur sur téléphone : une
                // cible de touche pleine largeur ne se rate pas.
                <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
                    {actions}
                </div>
            ) : null}
        </div>
    );
}
