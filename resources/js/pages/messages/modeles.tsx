import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, FileText, Pencil, Plus, Send, Trash2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { count } from '@/lib/format';
import type { Option } from '@/types';

type Template = {
    id: number;
    name: string;
    type: string;
    typeLabel: string;
    channel: string;
    channelLabel: string;
    subject: string | null;
    body: string;
    isActive: boolean;
    usageCount: number;
};

type FormState = {
    id?: number;
    name: string;
    type: string;
    channel: string;
    subject: string;
    body: string;
    is_active: boolean;
};

type Variable = { token: string; label: string };

function blank(): FormState {
    return {
        name: '',
        type: 'publicite',
        channel: 'whatsapp',
        subject: '',
        body: '',
        is_active: true,
    };
}

export default function Modeles({
    templates,
    types,
    channels,
    variables,
}: {
    templates: Template[];
    types: Array<Option & { description: string }>;
    channels: Option[];
    variables: Variable[];
}) {
    const [editing, setEditing] = useState<FormState | null>(null);
    const [deleting, setDeleting] = useState<Template | null>(null);
    const [formKey, setFormKey] = useState(0);

    function openEditor(state: FormState) {
        setEditing(state);
        setFormKey((key) => key + 1);
    }

    return (
        <>
            <Head title="Modèles de message" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Modèles de message"
                    description="Écrivez le texte une fois, réutilisez-le pour tous vos envois."
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href="/messages">
                                    <ArrowLeft className="size-4" />
                                    Retour
                                </Link>
                            </Button>
                            <Button onClick={() => openEditor(blank())}>
                                <Plus className="size-4" />
                                Nouveau modèle
                            </Button>
                        </>
                    }
                />

                <div className="rounded-xl border bg-card shadow-sm">
                    {templates.length === 0 ? (
                        <EmptyState
                            icon={FileText}
                            title="Aucun modèle"
                            description="Un modèle évite de réécrire le même message à chaque campagne."
                            action={
                                <Button
                                    size="sm"
                                    onClick={() => openEditor(blank())}
                                >
                                    <Plus className="size-4" />
                                    Nouveau modèle
                                </Button>
                            }
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Modèle</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Canal</TableHead>
                                    <TableHead className="text-right">
                                        Utilisé
                                    </TableHead>
                                    <TableHead>État</TableHead>
                                    <TableHead className="w-28" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {templates.map((template) => (
                                    <TableRow key={template.id}>
                                        <TableCell>
                                            <span className="font-medium">
                                                {template.name}
                                            </span>
                                            <span className="block max-w-md truncate text-xs text-muted-foreground">
                                                {template.body}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {template.typeLabel}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {template.channelLabel}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {count(template.usageCount)}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge
                                                label={
                                                    template.isActive
                                                        ? 'Actif'
                                                        : 'Inactif'
                                                }
                                                tone={
                                                    template.isActive
                                                        ? 'success'
                                                        : 'neutral'
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    asChild
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Envoyer avec ce modèle"
                                                >
                                                    <Link
                                                        href={`/messages/nouveau?modele=${template.id}`}
                                                    >
                                                        <Send className="size-4" />
                                                    </Link>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        openEditor({
                                                            id: template.id,
                                                            name: template.name,
                                                            type: template.type,
                                                            channel:
                                                                template.channel,
                                                            subject:
                                                                template.subject ??
                                                                '',
                                                            body: template.body,
                                                            is_active:
                                                                template.isActive,
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
                                                        setDeleting(template)
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

            <TemplateDialog
                key={formKey}
                state={editing}
                types={types}
                channels={channels}
                variables={variables}
                onClose={() => setEditing(null)}
            />

            <Dialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer ce modèle ?</DialogTitle>
                        <DialogDescription>
                            « {deleting?.name} » sera supprimé. Les messages
                            déjà envoyés avec ce modèle restent dans
                            l'historique.
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
                                router.delete(
                                    `/messages/modeles/${deleting?.id}`,
                                    {
                                        preserveScroll: true,
                                        onFinish: () => setDeleting(null),
                                    },
                                )
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

function TemplateDialog({
    state,
    types,
    channels,
    variables,
    onClose,
}: {
    state: FormState | null;
    types: Array<Option & { description: string }>;
    channels: Option[];
    variables: Variable[];
    onClose: () => void;
}) {
    const [form, setForm] = useState<FormState>(state ?? blank());
    const [errors, setErrors] = useState<Record<string, string>>({});

    const isEmail = form.channel === 'email';

    function submit(event: React.FormEvent) {
        event.preventDefault();

        const payload = { ...form, subject: isEmail ? form.subject : null };
        const options = {
            preserveScroll: true,
            onError: (received: Record<string, string>) => setErrors(received),
            onSuccess: () => onClose(),
        };

        if (form.id) {
            router.put(`/messages/modeles/${form.id}`, payload, options);
        } else {
            router.post('/messages/modeles', payload, options);
        }
    }

    return (
        <Dialog
            open={state !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <DialogContent className="sm:max-w-2xl">
                <form onSubmit={submit}>
                    <DialogHeader>
                        <DialogTitle>
                            {form.id ? 'Modifier le modèle' : 'Nouveau modèle'}
                        </DialogTitle>
                        <DialogDescription>
                            Les mots entre accolades sont remplacés pour chaque
                            client à l'envoi.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Nom du modèle</Label>
                            <Input
                                id="name"
                                value={form.name}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        name: event.target.value,
                                    })
                                }
                                placeholder="Rappel facture — première relance"
                                required
                            />
                            {errors.name ? (
                                <p className="text-xs text-destructive">
                                    {errors.name}
                                </p>
                            ) : null}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="tpl-type">Type</Label>
                                <Select
                                    value={form.type}
                                    onValueChange={(value) =>
                                        setForm({ ...form, type: value })
                                    }
                                >
                                    <SelectTrigger
                                        id="tpl-type"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {types.map((option) => (
                                            <SelectItem
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="tpl-canal">Canal</Label>
                                <Select
                                    value={form.channel}
                                    onValueChange={(value) =>
                                        setForm({ ...form, channel: value })
                                    }
                                >
                                    <SelectTrigger
                                        id="tpl-canal"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {channels.map((option) => (
                                            <SelectItem
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {isEmail ? (
                            <div className="grid gap-2">
                                <Label htmlFor="tpl-objet">Objet</Label>
                                <Input
                                    id="tpl-objet"
                                    value={form.subject}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            subject: event.target.value,
                                        })
                                    }
                                />
                            </div>
                        ) : null}

                        <div className="grid gap-2">
                            <Label htmlFor="tpl-texte">Texte</Label>
                            <Textarea
                                id="tpl-texte"
                                value={form.body}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        body: event.target.value,
                                    })
                                }
                                rows={6}
                                required
                            />
                            {errors.body ? (
                                <p className="text-xs text-destructive">
                                    {errors.body}
                                </p>
                            ) : null}

                            <div className="flex flex-wrap gap-1.5">
                                {variables.map((variable) => (
                                    <button
                                        key={variable.token}
                                        type="button"
                                        title={variable.label}
                                        onClick={() =>
                                            setForm((current) => ({
                                                ...current,
                                                body: `${current.body}${current.body.endsWith(' ') || current.body === '' ? '' : ' '}${variable.token}`,
                                            }))
                                        }
                                        className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] hover:bg-accent"
                                    >
                                        {variable.token}
                                    </button>
                                ))}
                            </div>
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
                            Modèle actif
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

Modeles.layout = {
    breadcrumbs: [
        { title: 'Messages', href: '/messages' },
        { title: 'Modèles', href: '/messages/modeles' },
    ],
};
