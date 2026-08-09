import { Head, Link, router } from '@inertiajs/react';
import { PackageSearch } from 'lucide-react';
import { ProductCard } from '@/components/boutique/product-card';
import type { ProductCardData } from '@/components/boutique/product-card';
import { cascade, SectionHeader } from '@/components/boutique/vitrine';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import type { Paginated } from '@/types';

type Filters = {
    categorie?: string;
    recherche?: string;
    tri?: string;
};

export default function Catalogue({
    products,
    filters,
    categories,
}: {
    products: Paginated<ProductCardData>;
    filters: Filters;
    categories: Array<{ name: string; slug: string }>;
}) {
    function apply(patch: Filters) {
        router.get(
            '/boutique/catalogue',
            { ...filters, ...patch },
            { preserveScroll: true, preserveState: true, replace: true },
        );
    }

    const categorie = categories.find((c) => c.slug === filters.categorie);

    return (
        <>
            <Head title="Nos valises" />

            <div className="mx-auto max-w-[1600px] px-4 py-10 sm:py-14">
                <SectionHeader
                    kicker={
                        filters.recherche
                            ? 'Résultats de recherche'
                            : 'Le catalogue'
                    }
                    title={
                        filters.recherche
                            ? `« ${filters.recherche} »`
                            : (categorie?.name ?? 'Nos valises')
                    }
                    subtitle={`${products.total} article${products.total > 1 ? 's' : ''} disponible${products.total > 1 ? 's' : ''}`}
                />

                {/*
                 * Des pastilles plutôt qu'un panneau de filtres : sur
                 * téléphone, un tiroir se referme sans qu'on sache ce qui
                 * reste actif.
                 */}
                <div className="mt-8 flex flex-wrap items-center gap-2 border-y py-4">
                    <Pastille
                        active={!filters.categorie}
                        onClick={() => apply({ categorie: '' })}
                    >
                        Tout
                    </Pastille>
                    {categories.map((candidate) => (
                        <Pastille
                            key={candidate.slug}
                            active={filters.categorie === candidate.slug}
                            onClick={() => apply({ categorie: candidate.slug })}
                        >
                            {candidate.name}
                        </Pastille>
                    ))}

                    <span className="ml-auto flex gap-2">
                        <Pastille
                            active={filters.tri !== 'nouveautes'}
                            onClick={() => apply({ tri: '' })}
                        >
                            A → Z
                        </Pastille>
                        <Pastille
                            active={filters.tri === 'nouveautes'}
                            onClick={() => apply({ tri: 'nouveautes' })}
                        >
                            Nouveautés
                        </Pastille>
                    </span>
                </div>

                {products.data.length === 0 ? (
                    <div className="border">
                        <EmptyState
                            icon={PackageSearch}
                            title="Aucun article"
                            description="Essayez une autre catégorie ou un autre mot-clé."
                            action={
                                <Link
                                    href="/boutique/catalogue"
                                    className="vitrine-libelle border-b border-current pb-0.5 text-xs"
                                >
                                    Voir tout le catalogue
                                </Link>
                            }
                        />
                    </div>
                ) : (
                    <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
                        {products.data.map((produit, index) => (
                            <ProductCard
                                key={produit.id}
                                product={produit}
                                /* La grille est longue : les cartes du bas
                                   apparaissent quand on les atteint. */
                                revele
                                style={cascade(index % 4)}
                            />
                        ))}
                    </div>
                )}

                <div className="mt-12 border-t pt-6">
                    <DataPagination
                        links={products.links}
                        from={products.from}
                        to={products.to}
                        total={products.total}
                        label="articles"
                    />
                </div>
            </div>
        </>
    );
}

function Pastille({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'vitrine-libelle border px-4 py-2 text-[11px] transition-[background-color,color,border-color,transform] duration-150 ease-out active:scale-[0.97]',
                active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}
