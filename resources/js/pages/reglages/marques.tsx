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
import { count } from '@/lib/format';

type Brand = {
    id: number;
    name: string;
    slug: string;
    isActive: boolean;
    productsCount: number;
};

type FormState = { id?: number; name: string; is_active: boolean };

export default function MarquesIndex({ brands }: { brands: Brand[] }) {
    const [editing, setEditing] = useState<FormState | null>(null);
    const [deleting, setDeleting] = useState<Brand | null>(null);
    const [formKey, setFormKey] = useState(0);

    function openEditor(state: FormState) {
        setEditing(state);
        setFormKey((key) => key + 1);
    }

    return (
        <>
            <Head title="Marques" />

            <div className="space-y-4">
                <PageHeader
                    title="Marques"
                    description="Fabricants des articles vendus."
                    actions={
                        <Button
                            onClick={() =>
                                openEditor({ name: '', is_active: true })
                            }
                        >
                            <Plus className="size-4" />
                            Nouvelle marque
                        </Button>
                    }
                />

                <div className="rounded-xl border bg-card shadow-sm">
                    {brands.length === 0 ? (
                        <EmptyState
                            icon={Tags}
                            title="Aucune marque"
                            description="Ajoutez les marques que vous distribuez."
                            action={
                                <Button
                                    size="sm"
                                    onClick={() =>
                                        openEditor({
                                            name: '',
                                            is_active: true,
                                        })
                                    }
                                >
                                    <Plus className="size-4" />
                                    Nouvelle marque
                                </Button>
                            }
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Marque</TableHead>
                                    <TableHead className="text-right">
                                        Produits
                                    </TableHead>
                                    <TableHead>État</TableHead>
                                    <TableHead className="w-20" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {brands.map((brand) => (
                                    <TableRow key={brand.id}>
                                        <TableCell className="font-medium">
                                            {brand.name}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {count(brand.productsCount)}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge
                                                label={
                                                    brand.isActive
                                                        ? 'Active'
                                                        : 'Inactive'
                                                }
                                                tone={
                                                    brand.isActive
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
                                                            id: brand.id,
                                                            name: brand.name,
                                                            is_active:
                                                                brand.isActive,
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
                                                        setDeleting(brand)
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

            <BrandDialog
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
                        <DialogTitle>Supprimer cette marque ?</DialogTitle>
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
                                router.delete(`/marques/${deleting?.id}`, {
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

function BrandDialog({
    state,
    onClose,
}: {
    state: FormState | null;
    onClose: () => void;
}) {
    const [form, setForm] = useState<FormState>(
        state ?? { name: '', is_active: true },
    );
    const [errors, setErrors] = useState<Record<string, string>>({});

    function submit(event: React.FormEvent) {
        event.preventDefault();

        const options = {
            preserveScroll: true,
            onError: (received: Record<string, string>) => setErrors(received),
            onSuccess: () => onClose(),
        };

        if (form.id) {
            router.put(`/marques/${form.id}`, form, options);
        } else {
            router.post('/marques', form, options);
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
                            {form.id ? 'Modifier la marque' : 'Nouvelle marque'}
                        </DialogTitle>
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
                                placeholder="Samsonite"
                                required
                            />
                            {errors.name ? (
                                <p className="text-xs text-destructive">
                                    {errors.name}
                                </p>
                            ) : null}
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
                            Marque active
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

MarquesIndex.layout = {
    breadcrumbs: [
        { title: 'Réglages', href: '/reglages/boutique' },
        { title: 'Marques', href: '/reglages/marques' },
    ],
};
