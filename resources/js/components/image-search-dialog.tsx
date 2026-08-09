import { Check, Loader2, Search, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type RemoteImage = {
    url: string;
    thumbnail: string;
    title: string;
    source: string;
};

type SearchResult = RemoteImage & {
    id: number;
    width: number;
    height: number;
};

/**
 * Recherche de photos en ligne.
 *
 * Le champ arrive pré-rempli avec le nom du produit : dans la plupart des cas
 * le gérant n'a qu'à cliquer sur « Rechercher ». Les images sélectionnées ne
 * sont téléchargées qu'à l'enregistrement de la fiche.
 */
export function ImageSearchDialog({
    open,
    onOpenChange,
    productName,
    alreadyPicked,
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productName: string;
    alreadyPicked: string[];
    onConfirm: (images: RemoteImage[]) => void;
}) {
    // Le composant n'est monté qu'à l'ouverture : le champ part donc rempli du
    // nom du produit, sans avoir à le resynchroniser ensuite.
    const [query, setQuery] = useState(productName);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    async function run() {
        const term = query.trim();

        if (term.length < 2) {
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const response = await fetch(
                `/produits/recherche-images?q=${encodeURIComponent(term)}`,
                { headers: { Accept: 'application/json' } },
            );

            if (response.status === 429) {
                setMessage(
                    'Trop de recherches à la suite. Patientez une minute.',
                );
                setResults([]);

                return;
            }

            if (!response.ok) {
                setMessage('La recherche a échoué. Réessayez.');
                setResults([]);

                return;
            }

            const payload = (await response.json()) as {
                message: string | null;
                results: SearchResult[];
            };

            setMessage(payload.message);
            setResults(payload.results ?? []);
        } catch {
            setMessage('Impossible de joindre le serveur.');
            setResults([]);
        } finally {
            setLoading(false);
            setSearched(true);
        }
    }

    function toggle(url: string) {
        setSelected((current) =>
            current.includes(url)
                ? current.filter((item) => item !== url)
                : [...current, url],
        );
    }

    function confirm() {
        onConfirm(
            results
                .filter((result) => selected.includes(result.url))
                .map(({ url, thumbnail, title, source }) => ({
                    url,
                    thumbnail,
                    title,
                    source,
                })),
        );
        onOpenChange(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Rechercher des photos</DialogTitle>
                    <DialogDescription>
                        Sélectionnez les photos à reprendre. Elles seront
                        téléchargées et allégées à l'enregistrement du produit.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void run();
                                }
                            }}
                            placeholder="Nom du produit…"
                            className="pl-8"
                            autoFocus
                        />
                    </div>
                    <Button
                        type="button"
                        onClick={() => void run()}
                        disabled={loading || query.trim().length < 2}
                    >
                        {loading ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Search className="size-4" />
                        )}
                        Rechercher
                    </Button>
                </div>

                {message ? (
                    <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        {message}
                    </p>
                ) : null}

                <div className="max-h-[52vh] min-h-40 overflow-y-auto">
                    {loading ? (
                        <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            Recherche en cours…
                        </div>
                    ) : results.length === 0 ? (
                        <p className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                            {searched && !message
                                ? 'Aucune image trouvée pour cette recherche.'
                                : 'Lancez la recherche pour voir des propositions.'}
                        </p>
                    ) : (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                            {results.map((result, index) => {
                                const isSelected = selected.includes(
                                    result.url,
                                );
                                const isPicked = alreadyPicked.includes(
                                    result.url,
                                );

                                return (
                                    // Les vignettes arrivent au fil de la
                                    // grille : la recherche se voit aboutir.
                                    <li
                                        key={result.id}
                                        className="anim-cellule"
                                        style={{
                                            animationDelay: `${Math.min(index, 12) * 30}ms`,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggle(result.url)}
                                            disabled={isPicked}
                                            className={cn(
                                                'group relative block w-full overflow-hidden rounded-lg border text-left transition-all duration-200 ease-out',
                                                isSelected &&
                                                    'ring-2 ring-primary',
                                                isPicked
                                                    ? 'cursor-not-allowed opacity-40'
                                                    : 'hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]',
                                            )}
                                        >
                                            <span className="block aspect-square overflow-hidden bg-muted">
                                                <img
                                                    src={result.thumbnail}
                                                    alt={result.title}
                                                    loading="lazy"
                                                    referrerPolicy="no-referrer"
                                                    className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                                                />
                                            </span>

                                            {isSelected ? (
                                                <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                    <Check className="size-3" />
                                                </span>
                                            ) : null}

                                            <span className="block px-2 py-1.5">
                                                <span className="block truncate text-[11px] text-muted-foreground">
                                                    {result.source}
                                                </span>
                                                {result.width > 0 ? (
                                                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                                                        {result.width} ×{' '}
                                                        {result.height}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <DialogFooter className="sm:justify-between">
                    <p className="self-center text-xs text-muted-foreground">
                        Les images restent la propriété de leurs auteurs.
                    </p>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Annuler
                        </Button>
                        <Button
                            type="button"
                            onClick={confirm}
                            disabled={selected.length === 0}
                        >
                            Ajouter {selected.length > 0 ? selected.length : ''}{' '}
                            photo{selected.length > 1 ? 's' : ''}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
