import { Head, Link, router } from '@inertiajs/react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
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
import { Textarea } from '@/components/ui/textarea';
import { useFilters } from '@/hooks/use-filters';
import { count, money } from '@/lib/format';
import type { Paginated } from '@/types';

type Customer = {
    id: number;
    type: string;
    name: string;
    displayName: string;
    companyName: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    address: string | null;
    ninea: string | null;
    notes: string | null;
    isActive: boolean;
    whatsappOptIn: boolean;
    salesCount: number;
    revenue: number;
};

type FormState = {
    id?: number;
    type: string;
    name: string;
    company_name: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    ninea: string;
    notes: string;
    is_active: boolean;
    whatsapp_opt_in: boolean;
};

function blank(): FormState {
    return {
        type: 'particulier',
        name: '',
        company_name: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        ninea: '',
        notes: '',
        is_active: true,
        whatsapp_opt_in: false,
    };
}

export default function ClientsIndex({
    customers,
    filters,
}: {
    customers: Paginated<Customer>;
    filters: Record<string, string | undefined>;
}) {
    const { values, set, reset, isFiltered } = useFilters('/clients', {
        recherche: filters.recherche ?? '',
        type: filters.type ?? '',
    });

    const [editing, setEditing] = useState<FormState | null>(null);
    const [deleting, setDeleting] = useState<Customer | null>(null);
    // Incrémenté à chaque ouverture pour remonter le formulaire : sans ça, un
    // nouveau client rouvert garderait la saisie précédente.
    const [formKey, setFormKey] = useState(0);

    function openEditor(state: FormState) {
        setEditing(state);
        setFormKey((key) => key + 1);
    }

    /** Modifier / supprimer — les mêmes boutons dans le tableau et sur la tuile. */
    function actions(customer: Customer) {
        return (
            <>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                        openEditor({
                            id: customer.id,
                            type: customer.type,
                            name: customer.name,
                            company_name: customer.companyName ?? '',
                            phone: customer.phone ?? '',
                            email: customer.email ?? '',
                            address: customer.address ?? '',
                            city: customer.city ?? '',
                            ninea: customer.ninea ?? '',
                            notes: customer.notes ?? '',
                            is_active: customer.isActive,
                            whatsapp_opt_in: customer.whatsappOptIn,
                        })
                    }
                    aria-label="Modifier"
                >
                    <Pencil className="size-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleting(customer)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Supprimer"
                >
                    <Trash2 className="size-4" />
                </Button>
            </>
        );
    }

    return (
        <>
            <Head title="Clients" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Clients"
                    description="Fichier client de la boutique et des ventes en ligne."
                    actions={
                        <Button onClick={() => openEditor(blank())}>
                            <Plus className="size-4" />
                            Nouveau client
                        </Button>
                    }
                />

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Nom, téléphone, société…"
                    onReset={reset}
                    isFiltered={isFiltered}
                >
                    <FilterSelect
                        value={values.type}
                        onChange={(value) => set('type', value, true)}
                        options={[
                            { value: 'particulier', label: 'Particuliers' },
                            { value: 'entreprise', label: 'Entreprises' },
                        ]}
                        allLabel="Tous les types"
                    />
                </FilterBar>

                <DataList
                    rows={customers.data}
                    getKey={(customer) => customer.id}
                    columns={[
                        {
                            key: 'client',
                            header: 'Client',
                            cell: (customer) => (
                                <>
                                    <Link
                                        href={`/clients/${customer.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {customer.displayName}
                                    </Link>
                                    <span className="block text-xs text-muted-foreground">
                                        {customer.type === 'entreprise'
                                            ? 'Entreprise'
                                            : 'Particulier'}
                                        {customer.email
                                            ? ` · ${customer.email}`
                                            : ''}
                                    </span>
                                    {!customer.isActive ? (
                                        <StatusBadge
                                            label="Inactif"
                                            tone="neutral"
                                            className="mt-1"
                                        />
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'telephone',
                            header: 'Téléphone',
                            className: 'text-sm',
                            cell: (customer) => customer.phone ?? '—',
                        },
                        {
                            key: 'ville',
                            header: 'Ville',
                            hideBelow: 'xl',
                            className: 'text-sm text-muted-foreground',
                            cell: (customer) => customer.city ?? '—',
                        },
                        {
                            key: 'achats',
                            header: 'Achats',
                            align: 'right',
                            cell: (customer) => count(customer.salesCount),
                        },
                        {
                            key: 'total',
                            header: 'Total dépensé',
                            align: 'right',
                            className: 'font-medium',
                            cell: (customer) => money(customer.revenue),
                        },
                        {
                            key: 'actions',
                            header: '',
                            headClassName: 'w-20',
                            cell: (customer) => (
                                <div className="flex justify-end gap-1">
                                    {actions(customer)}
                                </div>
                            ),
                        },
                    ]}
                    tileHref={(customer) => `/clients/${customer.id}`}
                    tile={(customer) => (
                        <div className="space-y-2">
                            <TileHeader
                                title={customer.displayName}
                                subtitle={[
                                    customer.type === 'entreprise'
                                        ? 'Entreprise'
                                        : 'Particulier',
                                    customer.phone,
                                    customer.city,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                trailing={
                                    <>
                                        <span className="block text-sm font-semibold tabular-nums">
                                            {money(customer.revenue)}
                                        </span>
                                        <span className="block text-xs text-muted-foreground tabular-nums">
                                            {count(customer.salesCount)} achat
                                            {customer.salesCount > 1 ? 's' : ''}
                                        </span>
                                    </>
                                }
                            />
                            <div className="flex items-center justify-between gap-2">
                                {customer.isActive ? (
                                    <span />
                                ) : (
                                    <StatusBadge
                                        label="Inactif"
                                        tone="neutral"
                                    />
                                )}
                                <div className="flex gap-1">
                                    {actions(customer)}
                                </div>
                            </div>
                        </div>
                    )}
                    empty={
                        <EmptyState
                            icon={Users}
                            title="Aucun client"
                            description={
                                isFiltered
                                    ? 'Aucun client ne correspond à cette recherche.'
                                    : 'Ajoutez vos clients pour suivre leurs achats et leurs factures.'
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={customers.links}
                            from={customers.from}
                            to={customers.to}
                            total={customers.total}
                            label="clients"
                        />
                    }
                />
            </div>

            <CustomerDialog
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
                        <DialogTitle>Supprimer ce client ?</DialogTitle>
                        <DialogDescription>
                            {deleting?.salesCount
                                ? `${deleting.displayName} a ${deleting.salesCount} vente(s) enregistrée(s) : il sera désactivé plutôt que supprimé, pour ne pas casser l'historique.`
                                : `${deleting?.displayName} sera définitivement supprimé.`}
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
                                router.delete(`/clients/${deleting?.id}`, {
                                    preserveScroll: true,
                                    onFinish: () => setDeleting(null),
                                });
                            }}
                        >
                            Confirmer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function CustomerDialog({
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
            router.put(`/clients/${form.id}`, form, options);
        } else {
            router.post('/clients', form, options);
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
                            {form.id ? 'Modifier le client' : 'Nouveau client'}
                        </DialogTitle>
                        <DialogDescription>
                            Le téléphone sert à retrouver rapidement le client
                            en caisse.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3 py-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="type">Type</Label>
                            <Select
                                value={form.type}
                                onValueChange={(value) =>
                                    setForm({ ...form, type: value })
                                }
                            >
                                <SelectTrigger id="type" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="particulier">
                                        Particulier
                                    </SelectItem>
                                    <SelectItem value="entreprise">
                                        Entreprise
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

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
                                required
                            />
                            {errors.name ? (
                                <p className="text-xs text-destructive">
                                    {errors.name}
                                </p>
                            ) : null}
                        </div>

                        {form.type === 'entreprise' ? (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="company_name">
                                        Raison sociale
                                    </Label>
                                    <Input
                                        id="company_name"
                                        value={form.company_name}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                company_name:
                                                    event.target.value,
                                            })
                                        }
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="ninea">NINEA</Label>
                                    <Input
                                        id="ninea"
                                        value={form.ninea}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                ninea: event.target.value,
                                            })
                                        }
                                    />
                                </div>
                            </>
                        ) : null}

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
                                placeholder="77 000 00 00"
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
                            {errors.email ? (
                                <p className="text-xs text-destructive">
                                    {errors.email}
                                </p>
                            ) : null}
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
                                placeholder="Dakar"
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
                            Client actif
                        </label>

                        {/*
                         * Le consentement WhatsApp se recueille en boutique,
                         * de vive voix ou sur le ticket. Sans lui, aucune
                         * publicité ne partira — et c'est ce qui protège le
                         * numéro de la boutique du bannissement.
                         */}
                        <label className="flex items-start gap-2 text-sm sm:col-span-2">
                            <Checkbox
                                className="mt-0.5"
                                checked={form.whatsapp_opt_in}
                                onCheckedChange={(checked) =>
                                    setForm({
                                        ...form,
                                        whatsapp_opt_in: checked === true,
                                    })
                                }
                            />
                            <span>
                                Accepte de recevoir nos publicités sur WhatsApp
                                <span className="block text-xs text-muted-foreground">
                                    À cocher uniquement si le client l’a dit ou
                                    écrit. Meta bannit les numéros qui écrivent
                                    à des gens qui n’ont rien demandé.
                                </span>
                            </span>
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

ClientsIndex.layout = {
    breadcrumbs: [{ title: 'Clients', href: '/clients' }],
};
