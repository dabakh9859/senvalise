import { Head, router } from '@inertiajs/react';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
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
import { useFilters } from '@/hooks/use-filters';
import { count, money } from '@/lib/format';
import type { Paginated } from '@/types';

type Supplier = {
    id: number;
    name: string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    notes: string | null;
    isActive: boolean;
    arrivalsCount: number;
    invested: number;
};

type FormState = {
    id?: number;
    name: string;
    contact_name: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    country: string;
    notes: string;
    is_active: boolean;
};

function blank(): FormState {
    return {
        name: '',
        contact_name: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        country: '',
        notes: '',
        is_active: true,
    };
}

export default function FournisseursIndex({
    suppliers,
    filters,
}: {
    suppliers: Paginated<Supplier>;
    filters: Record<string, string | undefined>;
}) {
    const { values, set, reset, isFiltered } = useFilters('/fournisseurs', {
        recherche: filters.recherche ?? '',
    });

    const [editing, setEditing] = useState<FormState | null>(null);
    const [deleting, setDeleting] = useState<Supplier | null>(null);
    const [formKey, setFormKey] = useState(0);

    function openEditor(state: FormState) {
        setEditing(state);
        setFormKey((key) => key + 1);
    }

    return (
        <>
            <Head title="Fournisseurs" />

            <div className="space-y-4">
                <PageHeader
                    title="Fournisseurs"
                    description="Vos sources d'approvisionnement et le montant investi chez chacune."
                    actions={
                        <Button onClick={() => openEditor(blank())}>
                            <Plus className="size-4" />
                            Nouveau fournisseur
                        </Button>
                    }
                />

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Nom, contact ou téléphone…"
                    onReset={reset}
                    isFiltered={isFiltered}
                />

                <div className="rounded-xl border bg-card shadow-sm">
                    {suppliers.data.length === 0 ? (
                        <EmptyState
                            icon={Building2}
                            title="Aucun fournisseur"
                            description="Enregistrez vos fournisseurs pour les rattacher aux arrivages."
                            action={
                                <Button
                                    size="sm"
                                    onClick={() => openEditor(blank())}
                                >
                                    <Plus className="size-4" />
                                    Nouveau fournisseur
                                </Button>
                            }
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fournisseur</TableHead>
                                    <TableHead className="hidden lg:table-cell">Contact</TableHead>
                                    <TableHead className="hidden lg:table-cell">Pays</TableHead>
                                    <TableHead className="hidden lg:table-cell text-right">
                                        Arrivages
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Total investi
                                    </TableHead>
                                    <TableHead className="w-20" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suppliers.data.map((supplier) => (
                                    <TableRow key={supplier.id}>
                                        <TableCell>
                                            <span className="font-medium">
                                                {supplier.name}
                                            </span>
                                            {supplier.email ? (
                                                <span className="block text-xs text-muted-foreground">
                                                    {supplier.email}
                                                </span>
                                            ) : null}
                                            {!supplier.isActive ? (
                                                <StatusBadge
                                                    label="Inactif"
                                                    tone="neutral"
                                                    className="mt-1"
                                                />
                                            ) : null}
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell text-sm">
                                            {supplier.contactName ?? '—'}
                                            {supplier.phone ? (
                                                <span className="block text-xs text-muted-foreground">
                                                    {supplier.phone}
                                                </span>
                                            ) : null}
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                            {[supplier.city, supplier.country]
                                                .filter(Boolean)
                                                .join(', ') || '—'}
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell text-right tabular-nums">
                                            {count(supplier.arrivalsCount)}
                                        </TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">
                                            {money(supplier.invested)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        openEditor({
                                                            id: supplier.id,
                                                            name: supplier.name,
                                                            contact_name:
                                                                supplier.contactName ??
                                                                '',
                                                            phone:
                                                                supplier.phone ??
                                                                '',
                                                            email:
                                                                supplier.email ??
                                                                '',
                                                            address:
                                                                supplier.address ??
                                                                '',
                                                            city:
                                                                supplier.city ??
                                                                '',
                                                            country:
                                                                supplier.country ??
                                                                '',
                                                            notes:
                                                                supplier.notes ??
                                                                '',
                                                            is_active:
                                                                supplier.isActive,
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
                                                        setDeleting(supplier)
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

                    <div className="px-4 pb-3">
                        <DataPagination
                            links={suppliers.links}
                            from={suppliers.from}
                            to={suppliers.to}
                            total={suppliers.total}
                            label="fournisseurs"
                        />
                    </div>
                </div>
            </div>

            <SupplierDialog
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
                        <DialogTitle>Supprimer ce fournisseur ?</DialogTitle>
                        <DialogDescription>
                            {deleting?.arrivalsCount
                                ? `${deleting.name} a ${deleting.arrivalsCount} arrivage(s) : il sera désactivé plutôt que supprimé.`
                                : `${deleting?.name} sera définitivement supprimé.`}
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
                            onClick={() =>
                                router.delete(`/fournisseurs/${deleting?.id}`, {
                                    preserveScroll: true,
                                    onFinish: () => setDeleting(null),
                                })
                            }
                        >
                            Confirmer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function SupplierDialog({
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

        const options = {
            preserveScroll: true,
            onError: (received: Record<string, string>) => setErrors(received),
            onSuccess: () => onClose(),
        };

        if (form.id) {
            router.put(`/fournisseurs/${form.id}`, form, options);
        } else {
            router.post('/fournisseurs', form, options);
        }
    }

    return (
        <Dialog
            open={state !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit}>
                    <DialogHeader>
                        <DialogTitle>
                            {form.id
                                ? 'Modifier le fournisseur'
                                : 'Nouveau fournisseur'}
                        </DialogTitle>
                        <DialogDescription>
                            Ces informations apparaissent sur les fiches
                            d'arrivage.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3 py-4 sm:grid-cols-2">
                        <div className="grid gap-2 sm:col-span-2">
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
                                required
                            />
                            {errors.name ? (
                                <p className="text-xs text-destructive">
                                    {errors.name}
                                </p>
                            ) : null}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="contact_name">
                                Personne de contact
                            </Label>
                            <Input
                                id="contact_name"
                                value={form.contact_name}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        contact_name: event.target.value,
                                    })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="phone">Téléphone</Label>
                            <Input
                                id="phone"
                                value={form.phone}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        phone: event.target.value,
                                    })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="email">E-mail</Label>
                            <Input
                                id="email"
                                type="email"
                                value={form.email}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        email: event.target.value,
                                    })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="city">Ville</Label>
                            <Input
                                id="city"
                                value={form.city}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        city: event.target.value,
                                    })
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="country">Pays</Label>
                            <Input
                                id="country"
                                value={form.country}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        country: event.target.value,
                                    })
                                }
                                placeholder="Chine, Turquie, Sénégal…"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="address">Adresse</Label>
                            <Input
                                id="address"
                                value={form.address}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        address: event.target.value,
                                    })
                                }
                            />
                        </div>

                        <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea
                                id="notes"
                                value={form.notes}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        notes: event.target.value,
                                    })
                                }
                                rows={2}
                                placeholder="Délais, conditions de paiement, transitaire…"
                            />
                        </div>

                        <label className="flex items-center gap-2 text-sm sm:col-span-2">
                            <Checkbox
                                checked={form.is_active}
                                onCheckedChange={(checked) =>
                                    setForm({
                                        ...form,
                                        is_active: checked === true,
                                    })
                                }
                            />
                            Fournisseur actif
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

FournisseursIndex.layout = {
    breadcrumbs: [
        { title: 'Réglages', href: '/reglages/boutique' },
        { title: 'Fournisseurs', href: '/reglages/fournisseurs' },
    ],
};
