import { Head, router } from '@inertiajs/react';
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { count, date } from '@/lib/format';
import type { Option } from '@/types';

type User = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    roleLabel: string;
    isActive: boolean;
    salesCount: number;
    isSelf: boolean;
    createdAt: string | null;
};

type FormState = {
    id?: number;
    name: string;
    email: string;
    phone: string;
    role: string;
    password: string;
    is_active: boolean;
    isSelf?: boolean;
};

export default function UtilisateursIndex({
    users,
    roles,
}: {
    users: User[];
    roles: Option[];
}) {
    const [editing, setEditing] = useState<FormState | null>(null);
    const [deleting, setDeleting] = useState<User | null>(null);
    const [formKey, setFormKey] = useState(0);

    function openEditor(state: FormState) {
        setEditing(state);
        setFormKey((key) => key + 1);
    }

    return (
        <>
            <Head title="Utilisateurs" />

            <div className="space-y-4">
                <PageHeader
                    title="Utilisateurs"
                    description="Le gérant a accès à tout. Le vendeur est limité à la caisse, aux clients, aux documents et à la consultation du stock — sans voir les prix d'achat ni les marges."
                    actions={
                        <Button
                            onClick={() =>
                                openEditor({
                                    name: '',
                                    email: '',
                                    phone: '',
                                    role: 'vendeur',
                                    password: '',
                                    is_active: true,
                                })
                            }
                        >
                            <Plus className="size-4" />
                            Nouvel utilisateur
                        </Button>
                    }
                />

                <div className="rounded-xl border bg-card shadow-sm">
                    {users.length === 0 ? (
                        <EmptyState
                            icon={UsersRound}
                            title="Aucun utilisateur"
                            description="Créez les comptes de votre équipe."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Utilisateur</TableHead>
                                    <TableHead>Rôle</TableHead>
                                    <TableHead className="hidden lg:table-cell text-right">
                                        Ventes
                                    </TableHead>
                                    <TableHead className="hidden lg:table-cell">Créé le</TableHead>
                                    <TableHead>État</TableHead>
                                    <TableHead className="w-20" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell>
                                            <span className="font-medium">
                                                {user.name}
                                                {user.isSelf ? (
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        (vous)
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                {user.email}
                                                {user.phone
                                                    ? ` · ${user.phone}`
                                                    : ''}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge
                                                label={user.roleLabel}
                                                tone={
                                                    user.role === 'gerant'
                                                        ? 'info'
                                                        : 'neutral'
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell text-right tabular-nums">
                                            {count(user.salesCount)}
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                            {date(user.createdAt)}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge
                                                label={
                                                    user.isActive
                                                        ? 'Actif'
                                                        : 'Désactivé'
                                                }
                                                tone={
                                                    user.isActive
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
                                                            id: user.id,
                                                            name: user.name,
                                                            email: user.email,
                                                            phone:
                                                                user.phone ??
                                                                '',
                                                            role: user.role,
                                                            password: '',
                                                            is_active:
                                                                user.isActive,
                                                            isSelf: user.isSelf,
                                                        })
                                                    }
                                                    aria-label="Modifier"
                                                >
                                                    <Pencil className="size-4" />
                                                </Button>
                                                {!user.isSelf ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() =>
                                                            setDeleting(user)
                                                        }
                                                        className="text-muted-foreground hover:text-destructive"
                                                        aria-label="Supprimer"
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </div>

            <UserDialog
                key={formKey}
                state={editing}
                roles={roles}
                onClose={() => setEditing(null)}
            />

            <Dialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer cet utilisateur ?</DialogTitle>
                        <DialogDescription>
                            {deleting?.salesCount
                                ? `${deleting.name} a ${deleting.salesCount} vente(s) à son nom : le compte sera désactivé plutôt que supprimé, pour garder l'historique attribuable.`
                                : `Le compte de ${deleting?.name} sera supprimé.`}
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
                                router.delete(`/utilisateurs/${deleting?.id}`, {
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

function UserDialog({
    state,
    roles,
    onClose,
}: {
    state: FormState | null;
    roles: Option[];
    onClose: () => void;
}) {
    const [form, setForm] = useState<FormState>(
        state ?? {
            name: '',
            email: '',
            phone: '',
            role: 'vendeur',
            password: '',
            is_active: true,
        },
    );
    const [errors, setErrors] = useState<Record<string, string>>({});

    function submit(event: React.FormEvent) {
        event.preventDefault();

        const payload = {
            name: form.name,
            email: form.email,
            phone: form.phone || null,
            role: form.role,
            password: form.password || null,
            is_active: form.is_active,
        };

        const options = {
            preserveScroll: true,
            onError: (received: Record<string, string>) => setErrors(received),
            onSuccess: () => onClose(),
        };

        if (form.id) {
            router.put(`/utilisateurs/${form.id}`, payload, options);
        } else {
            router.post('/utilisateurs', payload, options);
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
                                ? "Modifier l'utilisateur"
                                : 'Nouvel utilisateur'}
                        </DialogTitle>
                        <DialogDescription>
                            {form.id
                                ? 'Laissez le mot de passe vide pour le conserver.'
                                : "L'utilisateur se connecte avec son e-mail et ce mot de passe."}
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
                                required
                            />
                            {errors.name ? (
                                <p className="text-xs text-destructive">
                                    {errors.name}
                                </p>
                            ) : null}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="email">
                                E-mail{' '}
                                <span className="text-destructive">*</span>
                            </Label>
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
                                required
                            />
                            {errors.email ? (
                                <p className="text-xs text-destructive">
                                    {errors.email}
                                </p>
                            ) : null}
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
                            <Label htmlFor="role">Rôle</Label>
                            <Select
                                value={form.role}
                                onValueChange={(value) =>
                                    setForm({ ...form, role: value })
                                }
                                disabled={form.isSelf}
                            >
                                <SelectTrigger id="role" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {roles.map((role) => (
                                        <SelectItem
                                            key={role.value}
                                            value={role.value}
                                        >
                                            {role.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {form.isSelf ? (
                                <p className="text-xs text-muted-foreground">
                                    Vous ne pouvez pas modifier votre propre
                                    rôle.
                                </p>
                            ) : null}
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="password">
                                Mot de passe
                                {form.id ? null : (
                                    <span className="text-destructive"> *</span>
                                )}
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                value={form.password}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        password: event.target.value,
                                    })
                                }
                                required={!form.id}
                                autoComplete="new-password"
                            />
                            {errors.password ? (
                                <p className="text-xs text-destructive">
                                    {errors.password}
                                </p>
                            ) : null}
                        </div>

                        {!form.isSelf ? (
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
                                Compte actif
                            </label>
                        ) : null}
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

UtilisateursIndex.layout = {
    breadcrumbs: [
        { title: 'Réglages', href: '/reglages/boutique' },
        { title: 'Utilisateurs', href: '/reglages/utilisateurs' },
    ],
};
