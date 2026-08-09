import { ImagePlus, Search, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImageSearchDialog } from '@/components/image-search-dialog';
import type { RemoteImage } from '@/components/image-search-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ExistingImage = {
    id: number;
    url: string;
    alt: string | null;
    isPrimary: boolean;
};

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 10;

/**
 * Photos d'un produit.
 *
 * Les images déjà enregistrées et celles qui viennent d'être choisies
 * s'affichent dans la même grille : le gérant voit le résultat final avant
 * d'enregistrer. Les fichiers ne partent qu'à la validation du formulaire.
 */
export function ImageUploader({
    existing,
    files,
    onFilesChange,
    deletedIds,
    onDeletedChange,
    primaryId,
    onPrimaryChange,
    remote,
    onRemoteChange,
    productName,
    searchEnabled,
}: {
    existing: ExistingImage[];
    files: File[];
    onFilesChange: (files: File[]) => void;
    deletedIds: number[];
    onDeletedChange: (ids: number[]) => void;
    primaryId: number | null;
    onPrimaryChange: (id: number) => void;
    remote: RemoteImage[];
    onRemoteChange: (images: RemoteImage[]) => void;
    productName: string;
    searchEnabled: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);

    const visible = existing.filter((image) => !deletedIds.includes(image.id));
    const total = visible.length + files.length + remote.length;

    // Aperçus locaux : révoqués quand la sélection change, sinon la mémoire
    // grimpe à chaque fichier ajouté puis retiré.
    const previews = useMemo(
        () => files.map((file) => URL.createObjectURL(file)),
        [files],
    );

    useEffect(() => {
        return () => previews.forEach((url) => URL.revokeObjectURL(url));
    }, [previews]);

    function accept(incoming: FileList | null) {
        if (!incoming) {
            return;
        }

        const accepted: File[] = [];

        for (const file of Array.from(incoming)) {
            if (!ACCEPTED.includes(file.type)) {
                toast.error(
                    `« ${file.name} » n'est pas une image JPG, PNG ou WebP.`,
                );
                continue;
            }

            if (file.size > MAX_BYTES) {
                toast.error(`« ${file.name} » dépasse 8 Mo.`);
                continue;
            }

            accepted.push(file);
        }

        const room = MAX_IMAGES - total;

        if (accepted.length > room) {
            toast.warning(`${MAX_IMAGES} photos au maximum par produit.`);
        }

        if (room > 0) {
            onFilesChange([...files, ...accepted.slice(0, room)]);
        }
    }

    return (
        <div className="space-y-3">
            {total > 0 ? (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                    {visible.map((image, index) => {
                        const isPrimary =
                            primaryId !== null
                                ? primaryId === image.id
                                : image.isPrimary;

                        return (
                            <li
                                key={image.id}
                                style={{
                                    animationDelay: `${Math.min(index, 10) * 35}ms`,
                                }}
                                className={cn(
                                    'anim-cellule group relative aspect-square overflow-hidden rounded-lg border bg-muted transition-shadow duration-200 hover:shadow-md',
                                    isPrimary && 'ring-2 ring-primary',
                                )}
                            >
                                <img
                                    src={image.url}
                                    alt={image.alt ?? ''}
                                    loading="lazy"
                                    className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                                />

                                <button
                                    type="button"
                                    onClick={() =>
                                        onDeletedChange([
                                            ...deletedIds,
                                            image.id,
                                        ])
                                    }
                                    className="absolute top-1 right-1 rounded-md bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                                    aria-label="Retirer cette photo"
                                >
                                    <X className="size-3.5" />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => onPrimaryChange(image.id)}
                                    className={cn(
                                        'absolute bottom-1 left-1 flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-[11px] transition-opacity',
                                        isPrimary
                                            ? 'text-amber-600 dark:text-amber-400'
                                            : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                                    )}
                                    aria-label="Définir comme photo principale"
                                >
                                    <Star
                                        className={cn(
                                            'size-3.5',
                                            isPrimary && 'fill-current',
                                        )}
                                    />
                                    {isPrimary ? 'Principale' : 'Principale ?'}
                                </button>
                            </li>
                        );
                    })}

                    {files.map((file, index) => (
                        <li
                            key={`${file.name}-${index}`}
                            className="group relative aspect-square overflow-hidden rounded-lg border border-dashed bg-muted"
                        >
                            <img
                                src={previews[index]}
                                alt=""
                                className="size-full object-cover"
                            />
                            <span className="absolute bottom-1 left-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                À envoyer
                            </span>
                            <button
                                type="button"
                                onClick={() =>
                                    onFilesChange(
                                        files.filter((_, i) => i !== index),
                                    )
                                }
                                className="absolute top-1 right-1 rounded-md bg-background/90 p-1 hover:text-destructive"
                                aria-label="Retirer cette photo"
                            >
                                <X className="size-3.5" />
                            </button>
                        </li>
                    ))}

                    {remote.map((image) => (
                        <li
                            key={image.url}
                            className="group relative aspect-square overflow-hidden rounded-lg border border-dashed bg-muted"
                        >
                            <img
                                src={image.thumbnail}
                                alt={image.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="size-full object-cover"
                            />
                            <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {image.source || 'En ligne'}
                            </span>
                            <button
                                type="button"
                                onClick={() =>
                                    onRemoteChange(
                                        remote.filter(
                                            (item) => item.url !== image.url,
                                        ),
                                    )
                                }
                                className="absolute top-1 right-1 rounded-md bg-background/90 p-1 hover:text-destructive"
                                aria-label="Retirer cette photo"
                            >
                                <X className="size-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    accept(event.dataTransfer.files);
                }}
                className={cn(
                    'rounded-lg border border-dashed transition-colors',
                    dragging
                        ? 'border-primary bg-accent'
                        : 'hover:bg-accent/40',
                )}
            >
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1 px-4 py-6 text-center"
                >
                    <ImagePlus className="size-5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                        Ajouter des photos
                    </span>
                    <span className="text-xs text-muted-foreground">
                        Glissez-déposez, ou cliquez pour choisir. JPG, PNG ou
                        WebP, 8 Mo maximum. {total}/{MAX_IMAGES}
                    </span>
                </button>

                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED.join(',')}
                    multiple
                    className="hidden"
                    onChange={(event) => {
                        accept(event.target.files);
                        // Remet le champ à zéro : sans ça, re-choisir le même
                        // fichier ne déclenche aucun évènement.
                        event.target.value = '';
                    }}
                />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchOpen(true)}
                    disabled={!searchEnabled || total >= MAX_IMAGES}
                >
                    <Search className="size-4" />
                    Rechercher des photos en ligne
                </Button>

                {!searchEnabled ? (
                    <span className="text-xs text-muted-foreground">
                        À activer dans Réglages → Intégrations.
                    </span>
                ) : null}
            </div>

            {/* Monté seulement à l'ouverture : la recherche repart à zéro à chaque fois. */}
            {searchOpen ? (
                <ImageSearchDialog
                    open
                    onOpenChange={setSearchOpen}
                    productName={productName}
                    alreadyPicked={remote.map((image) => image.url)}
                    onConfirm={(picked) => {
                        const room = MAX_IMAGES - total;
                        const fresh = picked.filter(
                            (image) =>
                                !remote.some((item) => item.url === image.url),
                        );

                        if (fresh.length > room) {
                            toast.warning(
                                `${MAX_IMAGES} photos au maximum par produit.`,
                            );
                        }

                        onRemoteChange([...remote, ...fresh.slice(0, room)]);
                    }}
                />
            ) : null}

            <p className="text-xs text-muted-foreground">
                Les photos sont automatiquement redressées et allégées à
                l'enregistrement. La photo principale est celle qui représentera
                le produit sur le site.
            </p>
        </div>
    );
}
