import { Head, router } from '@inertiajs/react';
import {
    ExternalLink,
    Image as ImageIcon,
    LayoutTemplate,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { date } from '@/lib/format';

type Block = {
    id: number;
    type: string;
    typeLabel: string;
    title: string | null;
    subtitle: string | null;
    body: string | null;
    image: string | null;
    videoUrl: string | null;
    linkUrl: string | null;
    linkLabel: string | null;
    productId: number | null;
    productName: string | null;
    position: number;
    isActive: boolean;
    startsAt: string | null;
    endsAt: string | null;
};

type FormState = {
    id?: number;
    type: string;
    title: string;
    subtitle: string;
    body: string;
    video_url: string;
    link_url: string;
    link_label: string;
    product_id: string;
    position: string;
    is_active: boolean;
    starts_at: string;
    ends_at: string;
    image: File | null;
};

const AUCUN = '__aucun__';

function blank(type = 'banniere'): FormState {
    return {
        type,
        title: '',
        subtitle: '',
        body: '',
        video_url: '',
        link_url: '',
        link_label: '',
        product_id: AUCUN,
        position: '0',
        is_active: true,
        starts_at: '',
        ends_at: '',
        image: null,
    };
}

export default function AccueilBoutique({
    blocks,
    types,
    products,
}: {
    blocks: Block[];
    types: Array<{ value: string; label: string; description: string }>;
    products: Array<{ id: number; name: string }>;
}) {
    const [editing, setEditing] = useState<FormState | null>(null);
    const [deleting, setDeleting] = useState<Block | null>(null);

    function submit(event: React.FormEvent) {
        event.preventDefault();

        if (!editing) {
            return;
        }

        // multipart obligatoire pour l'image ; Laravel n'accepte pas un PUT
        // multipart, d'où le POST même en modification.
        const payload: Record<string, string | number | boolean | File | null> = {
            type: editing.type,
            title: editing.title,
            subtitle: editing.subtitle,
            body: editing.body,
            video_url: editing.video_url || null,
            link_url: editing.link_url || null,
            link_label: editing.link_label || null,
            product_id:
                editing.product_id === AUCUN ? null : Number(editing.product_id),
            position: Number(editing.position) || 0,
            is_active: editing.is_active,
            starts_at: editing.starts_at || null,
            ends_at: editing.ends_at || null,
        };

        if (editing.image) {
            payload.image = editing.image;
        }

        router.post(
            editing.id
                ? `/reglages/accueil-boutique/${editing.id}`
                : '/reglages/accueil-boutique',
            payload,
            {
                forceFormData: true,
                preserveScroll: true,
                onSuccess: () => setEditing(null),
            },
        );
    }

    return (
        <>
            <Head title="Page d'accueil de la boutique" />

            <div className="space-y-4">
                <PageHeader
                    title="Page d'accueil"
                    description="Bannières, vidéos de publicité et mises en avant du site de vente."
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <a
                                    href="/boutique"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <ExternalLink className="size-4" />
                                    Voir la boutique
                                </a>
                            </Button>
                            <Button onClick={() => setEditing(blank())}>
                                <Plus className="size-4" />
                                Ajouter un bloc
                            </Button>
                        </>
                    }
                />

                {/* Un rappel utile : les dates permettent de préparer une
                    opération à l'avance et de la laisser s'éteindre seule. */}
                <p className="rounded-lg bg-muted px-4 py-2.5 text-xs text-muted-foreground">
                    Un bloc avec des dates de début et de fin apparaît et
                    disparaît tout seul : préparez vos promotions à l’avance,
                    personne n’aura à penser à les retirer.
                </p>

                {blocks.length === 0 ? (
                    <div className="rounded-xl border bg-card">
                        <EmptyState
                            icon={LayoutTemplate}
                            title="Page d'accueil par défaut"
                            description="Ajoutez une bannière, une vidéo ou une promotion pour personnaliser l'accueil."
                            action={
                                <Button
                                    size="sm"
                                    onClick={() => setEditing(blank())}
                                >
                                    <Plus className="size-4" />
                                    Ajouter un bloc
                                </Button>
                            }
                        />
                    </div>
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {blocks.map((block, index) => (
                            <li
                                key={block.id}
                                style={{ animationDelay: `${index * 40}ms` }}
                                className="anim-entree overflow-hidden rounded-xl border bg-card"
                            >
                                <div className="aspect-video bg-muted">
                                    {block.image ? (
                                        <img
                                            src={block.image}
                                            alt=""
                                            loading="lazy"
                                            className="size-full object-cover"
                                        />
                                    ) : (
                                        <span className="flex size-full items-center justify-center text-muted-foreground">
                                            <ImageIcon className="size-6" />
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">
                                                {block.title ?? 'Sans titre'}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {block.typeLabel}
                                                {block.productName
                                                    ? ` · ${block.productName}`
                                                    : ''}
                                            </p>
                                        </div>
                                        <StatusBadge
                                            label={
                                                block.isActive
                                                    ? 'Visible'
                                                    : 'Masqué'
                                            }
                                            tone={
                                                block.isActive
                                                    ? 'success'
                                                    : 'neutral'
                                            }
                                        />
                                    </div>

                                    {block.subtitle ? (
                                        <p className="line-clamp-2 text-xs text-muted-foreground">
                                            {block.subtitle}
                                        </p>
                                    ) : null}

                                    {block.startsAt || block.endsAt ? (
                                        <p className="text-xs text-muted-foreground">
                                            {block.startsAt
                                                ? `du ${date(block.startsAt)}`
                                                : ''}
                                            {block.endsAt
                                                ? ` au ${date(block.endsAt)}`
                                                : ''}
                                        </p>
                                    ) : null}

                                    <div className="flex justify-end gap-1 border-t pt-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                                setEditing({
                                                    id: block.id,
                                                    type: block.type,
                                                    title: block.title ?? '',
                                                    subtitle:
                                                        block.subtitle ?? '',
                                                    body: block.body ?? '',
                                                    video_url:
                                                        block.videoUrl ?? '',
                                                    link_url:
                                                        block.linkUrl ?? '',
                                                    link_label:
                                                        block.linkLabel ?? '',
                                                    product_id: block.productId
                                                        ? String(block.productId)
                                                        : AUCUN,
                                                    position: String(
                                                        block.position,
                                                    ),
                                                    is_active: block.isActive,
                                                    starts_at:
                                                        block.startsAt ?? '',
                                                    ends_at: block.endsAt ?? '',
                                                    image: null,
                                                })
                                            }
                                            aria-label="Modifier"
                                        >
                                            <Pencil className="size-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setDeleting(block)}
                                            className="text-muted-foreground hover:text-destructive"
                                            aria-label="Supprimer"
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Dialog
                open={editing !== null}
                onOpenChange={(open) => !open && setEditing(null)}
            >
                <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
                    <form onSubmit={submit} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>
                                {editing?.id ? 'Modifier le bloc' : 'Nouveau bloc'}
                            </DialogTitle>
                            <DialogDescription>
                                {types.find((t) => t.value === editing?.type)
                                    ?.description}
                            </DialogDescription>
                        </DialogHeader>

                        {editing ? (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="type">Type de bloc</Label>
                                    <Select
                                        value={editing.type}
                                        onValueChange={(value) =>
                                            setEditing({ ...editing, type: value })
                                        }
                                    >
                                        <SelectTrigger id="type" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {types.map((type) => (
                                                <SelectItem
                                                    key={type.value}
                                                    value={type.value}
                                                >
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="title">Titre</Label>
                                    <Input
                                        id="title"
                                        value={editing.title}
                                        onChange={(event) =>
                                            setEditing({
                                                ...editing,
                                                title: event.target.value,
                                            })
                                        }
                                        placeholder={
                                            editing.type === 'banniere'
                                                ? 'Des bagages qui tiennent, / rien de plus.'
                                                : undefined
                                        }
                                    />
                                    {/*
                                     * La césure du grand titre n'est pas
                                     * devinable : autant l'écrire là où le
                                     * gérant tape.
                                     */}
                                    {editing.type === 'banniere' ? (
                                        <p className="text-xs text-muted-foreground">
                                            Une <strong>barre oblique</strong>{' '}
                                            coupe le titre en deux lignes : la
                                            seconde s’affiche en bleu.
                                            Sans barre, la coupure se fait après
                                            la première virgule.
                                        </p>
                                    ) : null}
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="subtitle">Sous-titre</Label>
                                    <Input
                                        id="subtitle"
                                        value={editing.subtitle}
                                        onChange={(event) =>
                                            setEditing({
                                                ...editing,
                                                subtitle: event.target.value,
                                            })
                                        }
                                    />
                                </div>

                                {editing.type === 'video' ? (
                                    <div className="grid gap-2">
                                        <Label htmlFor="video">
                                            Adresse de la vidéo
                                        </Label>
                                        <Input
                                            id="video"
                                            type="url"
                                            value={editing.video_url}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    video_url:
                                                        event.target.value,
                                                })
                                            }
                                            placeholder="https://www.youtube.com/watch?v=…"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Collez le lien YouTube ou Vimeo tel
                                            quel, nous le convertissons.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid gap-2">
                                        <Label htmlFor="image">Image</Label>
                                        <Input
                                            id="image"
                                            type="file"
                                            accept="image/*"
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    image:
                                                        event.target
                                                            .files?.[0] ?? null,
                                                })
                                            }
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Redimensionnée et compressée
                                            automatiquement.
                                        </p>
                                    </div>
                                )}

                                {editing.type === 'promo' ? (
                                    <div className="grid gap-2">
                                        <Label htmlFor="produit">
                                            Produit mis en avant
                                        </Label>
                                        <Select
                                            value={editing.product_id}
                                            onValueChange={(value) =>
                                                setEditing({
                                                    ...editing,
                                                    product_id: value,
                                                })
                                            }
                                        >
                                            <SelectTrigger
                                                id="produit"
                                                className="w-full"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={AUCUN}>
                                                    Aucun
                                                </SelectItem>
                                                {products.map((product) => (
                                                    <SelectItem
                                                        key={product.id}
                                                        value={String(
                                                            product.id,
                                                        )}
                                                    >
                                                        {product.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : null}

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="link">
                                            Lien du bouton
                                        </Label>
                                        <Input
                                            id="link"
                                            value={editing.link_url}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    link_url:
                                                        event.target.value,
                                                })
                                            }
                                            placeholder="/boutique/catalogue"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="linkLabel">
                                            Texte du bouton
                                        </Label>
                                        <Input
                                            id="linkLabel"
                                            value={editing.link_label}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    link_label:
                                                        event.target.value,
                                                })
                                            }
                                            placeholder="J’en profite"
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="grid gap-2">
                                        <Label htmlFor="starts">Début</Label>
                                        <Input
                                            id="starts"
                                            type="date"
                                            value={editing.starts_at}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    starts_at:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="ends">Fin</Label>
                                        <Input
                                            id="ends"
                                            type="date"
                                            value={editing.ends_at}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    ends_at: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="position">Ordre</Label>
                                        <Input
                                            id="position"
                                            inputMode="numeric"
                                            value={editing.position}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    position:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                </div>

                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={editing.is_active}
                                        onCheckedChange={(checked) =>
                                            setEditing({
                                                ...editing,
                                                is_active: checked === true,
                                            })
                                        }
                                    />
                                    Bloc visible sur la boutique
                                </label>
                            </>
                        ) : null}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditing(null)}
                            >
                                Annuler
                            </Button>
                            <Button type="submit">Enregistrer</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Retirer ce bloc ?</DialogTitle>
                        <DialogDescription>
                            Il disparaîtra de la page d’accueil, avec son image.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleting(null)}
                        >
                            Annuler
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (deleting) {
                                    router.delete(
                                        `/reglages/accueil-boutique/${deleting.id}`,
                                        {
                                            preserveScroll: true,
                                            onFinish: () => setDeleting(null),
                                        },
                                    );
                                }
                            }}
                        >
                            Retirer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
