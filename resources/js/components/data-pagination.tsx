import { Link } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { count } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PaginationLink } from '@/types/senvalise';

/**
 * Pagination des listes. Laravel fournit déjà les liens « précédent /
 * numéros / suivant » : on se contente de les habiller.
 */
export function DataPagination({
    links,
    from,
    to,
    total,
    label = 'résultats',
}: {
    links: PaginationLink[];
    from: number | null;
    to: number | null;
    total: number;
    label?: string;
}) {
    if (total === 0) {
        return null;
    }

    const numbered = links.slice(1, -1);
    const previous = links[0];
    const next = links[links.length - 1];

    return (
        <div className="flex flex-col items-center justify-between gap-3 border-t px-1 pt-3 sm:flex-row">
            <p className="text-xs text-muted-foreground">
                {from && to ? (
                    <>
                        <span className="font-medium text-foreground">
                            {count(from)}–{count(to)}
                        </span>{' '}
                        sur {count(total)} {label}
                    </>
                ) : (
                    <>
                        {count(total)} {label}
                    </>
                )}
            </p>

            {links.length > 3 ? (
                <nav className="flex items-center gap-1">
                    <PageLink link={previous} icon="prev" />

                    <div className="hidden items-center gap-1 sm:flex">
                        {numbered.map((link, index) => (
                            <PageLink
                                key={`${link.label}-${index}`}
                                link={link}
                            />
                        ))}
                    </div>

                    <PageLink link={next} icon="next" />
                </nav>
            ) : null}
        </div>
    );
}

function PageLink({
    link,
    icon,
}: {
    link: PaginationLink;
    icon?: 'prev' | 'next';
}) {
    const content = icon ? (
        icon === 'prev' ? (
            <ChevronLeft className="size-4" />
        ) : (
            <ChevronRight className="size-4" />
        )
    ) : (
        <span dangerouslySetInnerHTML={{ __html: link.label }} />
    );

    const className = cn(
        'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-95',
        link.active
            ? 'border-transparent bg-primary font-medium text-primary-foreground'
            : 'hover:bg-accent hover:text-accent-foreground',
        !link.url && 'pointer-events-none opacity-40',
    );

    if (!link.url) {
        return <span className={className}>{content}</span>;
    }

    return (
        <Link href={link.url} className={className} preserveScroll>
            {content}
        </Link>
    );
}
