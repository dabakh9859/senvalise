import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    Eye,
    Loader2,
    Send,
    TriangleAlert,
    Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import InputError from '@/components/input-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { count } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Option } from '@/types';

type Template = {
    id: number;
    name: string;
    type: string;
    channel: string;
    subject: string | null;
    body: string;
};

type CustomerOption = {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    whatsappOptIn: boolean;
    whatsappWindowOpen: boolean;
};

type CloudTemplate = {
    name: string;
    language: string;
    status: string;
    category: string;
    body: string;
};

type UnpaidRow = {
    documentId: number;
    reference: string;
    customerId: number;
    customerName: string;
    phone: string | null;
    email: string | null;
    balanceLabel: string;
    dueDate: string | null;
    overdue: boolean;
};

type Variable = { token: string; label: string };

const NO_TEMPLATE = '__aucun__';

export default function MessageComposer({
    templates,
    customers,
    unpaid,
    types,
    channels,
    variables,
    channelsReady,
    defaultTemplate,
    whatsappDriver,
    whatsappTemplates,
}: {
    templates: Template[];
    customers: CustomerOption[];
    unpaid: UnpaidRow[];
    types: Array<Option & { description: string }>;
    channels: Option[];
    variables: Variable[];
    channelsReady: Record<string, boolean>;
    defaultTemplate: number | null;
    whatsappDriver: 'cloud' | 'waha';
    whatsappTemplates: CloudTemplate[];
}) {
    const initial = templates.find((t) => t.id === defaultTemplate);

    const [channel, setChannel] = useState(
        initial?.channel ?? (channelsReady.whatsapp ? 'whatsapp' : 'email'),
    );
    const [type, setType] = useState(initial?.type ?? 'publicite');
    const [templateId, setTemplateId] = useState(
        initial ? String(initial.id) : NO_TEMPLATE,
    );
    const [subject, setSubject] = useState(initial?.subject ?? '');
    const [body, setBody] = useState(initial?.body ?? '');
    const [label, setLabel] = useState('');

    const [mode, setMode] = useState<'clients' | 'impayes'>('clients');
    const [selected, setSelected] = useState<number[]>([]);
    const [search, setSearch] = useState('');

    const [preview, setPreview] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);
    const [metaTemplate, setMetaTemplate] = useState(NO_TEMPLATE);

    const isEmail = channel === 'email';

    // Sur l'API officielle, un message publicitaire exige le consentement du
    // client et un modele approuve par Meta. On le dit avant l'envoi plutot
    // que de laisser la moitie des destinataires etre ecartes en silence.
    const isCloudWhatsapp = !isEmail && whatsappDriver === 'cloud';
    const isMarketing = type === 'publicite' || type === 'promotion';
    const optedIn = customers.filter(
        (customer) => selected.includes(customer.id) && customer.whatsappOptIn,
    ).length;

    /* Un client n'est joignable que s'il a la coordonnée du canal choisi. */
    const reachable = useMemo(() => {
        const rows =
            mode === 'impayes'
                ? unpaid.map((row) => ({
                      id: row.customerId,
                      name: row.customerName,
                      phone: row.phone,
                      email: row.email,
                      extra: `${row.reference} · ${row.balanceLabel}${row.overdue ? ' · en retard' : ''}`,
                      documentId: row.documentId,
                  }))
                : customers.map((row) => ({
                      ...row,
                      extra: (isEmail ? row.email : row.phone) ?? '',
                      documentId: undefined as number | undefined,
                  }));

        const needle = search.trim().toLowerCase();

        return rows.filter((row) => {
            const contact = isEmail ? row.email : row.phone;

            if (!contact) {
                return false;
            }

            return (
                needle === '' ||
                row.name.toLowerCase().includes(needle) ||
                contact.toLowerCase().includes(needle)
            );
        });
    }, [mode, unpaid, customers, isEmail, search]);

    const unreachableCount = useMemo(() => {
        const rows = mode === 'impayes' ? unpaid : customers;

        return rows.filter((row) => !(isEmail ? row.email : row.phone)).length;
    }, [mode, unpaid, customers, isEmail]);

    function applyTemplate(value: string) {
        setTemplateId(value);

        const template = templates.find((t) => String(t.id) === value);

        if (template) {
            setChannel(template.channel);
            setType(template.type);
            setSubject(template.subject ?? '');
            setBody(template.body);
        }
    }

    function insert(token: string) {
        setBody(
            (current) =>
                `${current}${current.endsWith(' ') || current === '' ? '' : ' '}${token}`,
        );
    }

    async function showPreview() {
        const response = await fetch('/messages/apercu', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-XSRF-TOKEN': decodeURIComponent(
                    document.cookie
                        .split('; ')
                        .find((row) => row.startsWith('XSRF-TOKEN='))
                        ?.split('=')[1] ?? '',
                ),
            },
            body: JSON.stringify({ body, subject }),
        });

        if (!response.ok) {
            return;
        }

        const payload = (await response.json()) as { body: string };
        setPreview(payload.body);
    }

    function send() {
        setSending(true);

        const documentIds: Record<number, number> = {};

        if (mode === 'impayes') {
            for (const row of unpaid) {
                if (selected.includes(row.customerId)) {
                    documentIds[row.customerId] = row.documentId;
                }
            }
        }

        router.post(
            '/messages',
            {
                type,
                channel,
                subject: isEmail ? subject : null,
                body,
                label: label || null,
                message_template_id:
                    templateId === NO_TEMPLATE ? null : Number(templateId),
                customer_ids: selected,
                document_ids: documentIds,
                whatsapp_template:
                    isCloudWhatsapp && metaTemplate !== NO_TEMPLATE
                        ? metaTemplate.split('|')[0]
                        : null,
                whatsapp_language:
                    isCloudWhatsapp && metaTemplate !== NO_TEMPLATE
                        ? metaTemplate.split('|')[1]
                        : 'fr',
            },
            {
                onError: (received) => setErrors(received),
                onFinish: () => setSending(false),
            },
        );
    }

    const allSelected =
        reachable.length > 0 && selected.length === reachable.length;

    return (
        <>
            <Head title="Nouveau message" />

            <div className="flex flex-1 flex-col gap-5 p-4">
                <PageHeader
                    title="Nouveau message"
                    description="Choisissez le canal, écrivez le texte, sélectionnez les destinataires."
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href="/messages">
                                    <ArrowLeft className="size-4" />
                                    Retour
                                </Link>
                            </Button>
                            <Button
                                onClick={send}
                                disabled={
                                    sending ||
                                    selected.length === 0 ||
                                    body.trim() === ''
                                }
                            >
                                {sending ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Send className="size-4" />
                                )}
                                Envoyer à {count(selected.length)} client
                                {selected.length > 1 ? 's' : ''}
                            </Button>
                        </>
                    }
                />

                <div className="grid gap-4 lg:grid-cols-2">
                    {/* Le message */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Le message
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="canal">Canal</Label>
                                    <Select
                                        value={channel}
                                        onValueChange={setChannel}
                                    >
                                        <SelectTrigger
                                            id="canal"
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {channels.map((option) => (
                                                <SelectItem
                                                    key={option.value}
                                                    value={option.value}
                                                    disabled={
                                                        !channelsReady[
                                                            option.value
                                                        ]
                                                    }
                                                >
                                                    {option.label}
                                                    {channelsReady[option.value]
                                                        ? ''
                                                        : ' (non configuré)'}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="type">Type</Label>
                                    <Select
                                        value={type}
                                        onValueChange={setType}
                                    >
                                        <SelectTrigger
                                            id="type"
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
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="modele">
                                    Partir d'un modèle
                                </Label>
                                <Select
                                    value={templateId}
                                    onValueChange={applyTemplate}
                                >
                                    <SelectTrigger
                                        id="modele"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_TEMPLATE}>
                                            Écrire directement
                                        </SelectItem>
                                        {templates.map((template) => (
                                            <SelectItem
                                                key={template.id}
                                                value={String(template.id)}
                                            >
                                                {template.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/*
                             * Hors des 24 h qui suivent un message du client,
                             * WhatsApp n'accepte qu'un modèle approuvé par
                             * Meta. Sans ce choix, la moitié des destinataires
                             * serait écartée sans que personne comprenne
                             * pourquoi.
                             */}
                            {isCloudWhatsapp ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="modele-meta">
                                        Modèle approuvé par Meta
                                    </Label>
                                    <Select
                                        value={metaTemplate}
                                        onValueChange={setMetaTemplate}
                                    >
                                        <SelectTrigger
                                            id="modele-meta"
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NO_TEMPLATE}>
                                                Aucun — clients ayant écrit dans
                                                les 24 h seulement
                                            </SelectItem>
                                            {whatsappTemplates.map(
                                                (template) => (
                                                    <SelectItem
                                                        key={`${template.name}|${template.language}`}
                                                        value={`${template.name}|${template.language}`}
                                                    >
                                                        {template.name} (
                                                        {template.category.toLowerCase()}
                                                        )
                                                    </SelectItem>
                                                ),
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        {whatsappTemplates.length === 0
                                            ? 'Aucun modèle approuvé. Créez-en dans le gestionnaire WhatsApp de Meta, sinon vous ne pourrez écrire qu’aux clients qui viennent de vous répondre.'
                                            : 'Sans modèle, seuls les clients ayant écrit dans les 24 dernières heures recevront le message.'}
                                    </p>
                                </div>
                            ) : null}

                            {isCloudWhatsapp && isMarketing ? (
                                <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                                    <span>
                                        Message publicitaire : seuls les clients
                                        ayant donné leur accord le recevront (
                                        {count(optedIn)} sur{' '}
                                        {count(selected.length)} sélectionnés).
                                        Écrire à quelqu’un qui n’a rien demandé
                                        est la première cause de bannissement
                                        d’un numéro WhatsApp.
                                    </span>
                                </p>
                            ) : null}

                            {isEmail ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="objet">Objet</Label>
                                    <Input
                                        id="objet"
                                        value={subject}
                                        onChange={(event) =>
                                            setSubject(event.target.value)
                                        }
                                        placeholder="Nouvel arrivage de valises"
                                    />
                                </div>
                            ) : null}

                            <div className="grid gap-2">
                                <Label htmlFor="texte">Texte</Label>
                                <Textarea
                                    id="texte"
                                    value={body}
                                    onChange={(event) =>
                                        setBody(event.target.value)
                                    }
                                    rows={7}
                                    placeholder="Bonjour {client}, …"
                                />
                                <InputError message={errors.body} />

                                <div className="flex flex-wrap gap-1.5">
                                    {variables.map((variable) => (
                                        <button
                                            key={variable.token}
                                            type="button"
                                            onClick={() =>
                                                insert(variable.token)
                                            }
                                            title={variable.label}
                                            className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] hover:bg-accent"
                                        >
                                            {variable.token}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Ces mots sont remplacés pour chaque client
                                    au moment de l'envoi.
                                </p>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="label">
                                    Nom de la campagne (facultatif)
                                </Label>
                                <Input
                                    id="label"
                                    value={label}
                                    onChange={(event) =>
                                        setLabel(event.target.value)
                                    }
                                    placeholder="Arrivage septembre"
                                />
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void showPreview()}
                                disabled={body.trim() === ''}
                            >
                                <Eye className="size-4" />
                                Aperçu
                            </Button>

                            {preview ? (
                                <div className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">
                                    {preview}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    {/* Les destinataires */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Destinataires
                            </CardTitle>
                            <CardDescription>
                                Seuls les clients ayant{' '}
                                {isEmail
                                    ? 'une adresse e-mail'
                                    : 'un numéro de téléphone'}{' '}
                                apparaissent.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
                                {(
                                    [
                                        ['clients', 'Tous les clients'],
                                        ['impayes', 'Factures impayées'],
                                    ] as const
                                ).map(([value, text]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => {
                                            setMode(value);
                                            setSelected([]);
                                        }}
                                        className={cn(
                                            'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors',
                                            mode === value
                                                ? 'bg-background font-medium shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {text}
                                        {value === 'impayes' &&
                                        unpaid.length > 0
                                            ? ` (${unpaid.length})`
                                            : ''}
                                    </button>
                                ))}
                            </div>

                            <Input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Filtrer la liste…"
                            />

                            <div className="flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={allSelected}
                                        onCheckedChange={(checked) =>
                                            setSelected(
                                                checked === true
                                                    ? reachable.map((r) => r.id)
                                                    : [],
                                            )
                                        }
                                    />
                                    Tout sélectionner ({reachable.length})
                                </label>

                                <span className="text-xs text-muted-foreground">
                                    {count(selected.length)} sélectionné
                                    {selected.length > 1 ? 's' : ''}
                                </span>
                            </div>

                            <InputError message={errors.customer_ids} />

                            {unreachableCount > 0 ? (
                                <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                                    {unreachableCount} client(s) sans{' '}
                                    {isEmail ? 'e-mail' : 'numéro'} sont exclus
                                    de cette liste.
                                </p>
                            ) : null}

                            <div className="max-h-96 overflow-y-auto rounded-lg border">
                                {reachable.length === 0 ? (
                                    <p className="flex h-32 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                                        <Users className="mr-2 size-4" />
                                        Aucun destinataire joignable.
                                    </p>
                                ) : (
                                    <ul className="divide-y">
                                        {reachable.map((row) => (
                                            <li key={`${row.id}-${row.extra}`}>
                                                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent">
                                                    <Checkbox
                                                        checked={selected.includes(
                                                            row.id,
                                                        )}
                                                        onCheckedChange={(
                                                            checked,
                                                        ) =>
                                                            setSelected(
                                                                (current) =>
                                                                    checked ===
                                                                    true
                                                                        ? [
                                                                              ...current,
                                                                              row.id,
                                                                          ]
                                                                        : current.filter(
                                                                              (
                                                                                  id,
                                                                              ) =>
                                                                                  id !==
                                                                                  row.id,
                                                                          ),
                                                            )
                                                        }
                                                    />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium">
                                                            {row.name}
                                                        </span>
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {row.extra}
                                                        </span>
                                                    </span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

MessageComposer.layout = {
    breadcrumbs: [
        { title: 'Messages', href: '/messages' },
        { title: 'Nouveau', href: '/messages/nouveau' },
    ],
};
