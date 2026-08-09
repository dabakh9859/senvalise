import { Head, router } from '@inertiajs/react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { count } from '@/lib/format';

type Category = {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    position: number;
    isActive: boolean;
    productsCount: number;
};

type FormState = {
    id?: number;
    name: string;
    description: string;
    position: string;
    is_active: boolean;
};

function blank(): FormState {
    return { name: '', description: '', position: '0', is_active: true };
}

export default function CategoriesIndex({
    categories,
}: {
    categories: Category[];
}) {
    const [editing, setEditing] = useState<FormState | null>(null);
    const [deleting, setDeleting] = useState<Category | null>(null);
    const [formKey, setFormKey] = useState(0);

    function openEditor(state: FormState) {
        setEditing(state);
        setFormKey((key) => key + 1);
    }

    return (
        <>
            <Head title="Catégories" />

            <div className="space-y-4">
                <PageHeader
                    title="Catégories"
                    description="Familles de produits : valises rigides, sacs de voyage, accessoires…"
                    actions={
                        <Button onClick={() => openEditor(blank())}>
                            <Plus className="size-4" />
                            Nouvelle catégorie
                        </Button>
                    }
                />

                <div className="rounded-xl border bg-card shadow-sm">
                    {categories.length === 0 ? (
                        <EmptyState
                            icon={Tags}
                            title="Aucune catégorie"
                            description="Les catégories servent à filtrer le catalogue et la caisse."
                            action={
                                <Button
                                    size="sm"
                                    onClick={() => openEditor(blank())}
                                >
                                    <Plus className="size-4" />
                                    Nouvelle catégorie
                                </Button>
                            }
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-16 text-right">
                                        Ordre
                                    </TableHead>
                                    <TableHead>Catégorie</TableHead>
                                    <TableHead className="text-right">
                                        Produits
                                    </TableHead>
                                    <TableHead>État</TableHead>
                                    <TableHead className="w-20" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {categories.map((category) => (
                                    <TableRow key={category.id}>
                                        <TableCell className="text-right text-muted-foreground tabular-nums">
                                            {category.position}
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-medium">
                                                {category.name}
                                            </span>
                                            {category.description ? (
                                                <span className="block text-xs text-muted-foreground">
                                                    {category.description}
                                                </span>
                                            ) : null}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {count(category.productsCount)}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge
                                                label={
                                                    category.isActive
                                                        ? 'Active'
                                                        : 'Inactive'
                                                }
                                                tone={
                                                    category.isActive
                                                        ? 'success'
                                                        : 'neutral'
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        openEditor({
                                                            id: category.id,
                                                            name: category.name,
                                                            description:
                                                                category.description ??
                                                                '',
                                                            position: String(
                                                                category.position,
                                                            ),
                                                            is_active:
                                                                category.isActive,
                                                        })
                                                    }
                                                    aria-label="Modifier"
                                                >
                                                    <Pencil className="size-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        setDeleting(category)
                                                    }
                                                    className="text-muted-foreground hover:text-destructive"
                                                    aria-label="Supprimer"
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </div>

            <CategoryDialog
                key={formKey}
                state={editing}
                onClose={() => setEditing(null)}
            />

            <Dialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer cette catégorie ?</DialogTitle>
                        <DialogDescription>
                            {deleting?.productsCount
                                ? `« ${deleting.name} » est utilisée par ${deleting.productsCount} produit(s). Retirez-la d'abord de ces produits.`
                                : `« ${deleting?.name} » sera supprimée.`}
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
                            disabled={Boolean(deleting?.productsCount)}
                            onClick={() =>
                                router.delete(`/categories/${deleting?.id}`, {
                                    preserveScroll: true,
                                    onFinish: () => setDeleting(null),
                                })
                            }
                        >
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function CategoryDialog({
    state,
    onClose,
}: {
    state: FormState | null;
    onClose: () => void;
}) {
    const [form, setForm] = useState<FormState>(state ?? blank());
    const [errors, setErrors] = useState<Record<string, string>>({});

    function submit(event: React.FormEvent) {
        event.preventDefault();

        const payload = { ...form, position: Number(form.position) || 0 };
        const options = {
            preserveScroll: true,
            onError: (received: Record<string, string>) => setErrors(received),
            onSuccess: () => onClose(),
        };

        if (form.id) {
            router.put(`/categories/${form.id}`, payload, options);
        } else {
            router.post('/categories', payload, options);
        }
    }

    return (
        <Dialog
            open={state !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <DialogContent>
                <form onSubmit={submit}>
                    <DialogHeader>
                        <DialogTitle>
                            {form.id
                                ? 'Modifier la catégorie'
                                : 'Nouvelle catégorie'}
                        </DialogTitle>
                        <DialogDescription>
                            L'ordre détermine la position dans les listes
                            déroulantes et à la caisse.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">
                                Nom <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="name"
                                value={form.name}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        name: event.target.value,
                                    })
                                }
                                placeholder="Valises rigides"
                                required
                            />
                            {errors.name ? (
                                <p className="text-xs text-destructive">
                                    {errors.name}
                                </p>
                            ) : null}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={form.description}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        description: event.target.value,
                                    })
                                }
                                rows={2}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="position">Ordre d'affichage</Label>
                            <Input
                                id="position"
                                value={form.position}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        position: event.target.value.replace(
                                            /\D/g,
                                            '',
                                        ),
                                    })
                                }
                                inputMode="numeric"
                                className="w-28 tabular-nums"
                            />
                        </div>

                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={form.is_active}
                                onCheckedChange={(checked) =>
                                    setForm({
                                        ...form,
                                        is_active: checked === true,
                                    })
                                }
                            />
                            Catégorie active
                        </label>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                        >
                            Annuler
                        </Button>
                        <Button type="submit">Enregistrer</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

CategoriesIndex.layout = {
    breadcrumbs: [
        { title: 'Réglages', href: '/reglages/boutique' },
        { title: 'Catégories', href: '/reglages/categories' },
    ],
};
