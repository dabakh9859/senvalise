import { Head, Link, router } from '@inertiajs/react';
import {
    CheckCircle2,
    Clock,
    Mail,
    MessageSquare,
    Plus,
    RotateCw,
    Settings2,
    TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
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
import { useFilters } from '@/hooks/use-filters';
import { count, dateTime } from '@/lib/format';
import type { Option, Paginated, StatusTone } from '@/types';

type MessageRow = {
    id: number;
    type: string;
    typeLabel: string;
    channel: string;
    channelLabel: string;
    recipient: string;
    recipientName: string | null;
    customerId: number | null;
    subject: string | null;
    body: string;
    status: string;
    statusLabel: string;
    statusTone: StatusTone;
    error: string | null;
    batchLabel: string | null;
    sentAt: string | null;
    createdAt: string | null;
    author: string | null;
};

export default function MessagesIndex({
    messages,
    filters,
    types,
    channels,
    statuses,
    totals,
    channelsReady,
}: {
    messages: Paginated<MessageRow>;
    filters: Record<string, string | undefined>;
    types: Array<Option & { description: string }>;
    channels: Option[];
    statuses: Option[];
    totals: { sent: number; pending: number; failed: number };
    channelsReady: Record<string, boolean>;
}) {
    const { values, set, reset, isFiltered } = useFilters('/messages', {
        recherche: filters.recherche ?? '',
        type: filters.type ?? '',
        canal: filters.canal ?? '',
        statut: filters.statut ?? '',
        du: filters.du ?? '',
        au: filters.au ?? '',
    });

    const [opened, setOpened] = useState<MessageRow | null>(null);
    const noChannel = !channelsReady.email && !channelsReady.whatsapp;

    return (
        <>
            <Head title="Messages" />

            <div className="flex flex-1 flex-col gap-5 p-4">
                <PageHeader
                    title="Messages"
                    description="Publicités, promotions et rappels de paiement envoyés à vos clients."
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href="/messages/modeles">
                                    <Settings2 className="size-4" />
                                    Modèles
                                </Link>
                            </Button>
                            <Button asChild disabled={noChannel}>
                                <Link href="/messages/nouveau">
                                    <Plus className="size-4" />
                                    Nouveau message
                                </Link>
                            </Button>
                        </>
                    }
                />

                {noChannel ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                        <TriangleAlert className="size-4 shrink-0" />
                        <span className="flex-1">
                            Aucun canal d'envoi n'est configuré. Réglez l'e-mail
                            ou WhatsApp pour commencer.
                        </span>
                        <Button asChild size="sm" variant="outline">
                            <Link href="/reglages/integrations">
                                Configurer
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Mail className="size-4" />
                            E-mail :{' '}
                            {channelsReady.email ? (
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    prêt
                                </span>
                            ) : (
                                <span>non configuré</span>
                            )}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <MessageSquare className="size-4" />
                            WhatsApp :{' '}
                            {channelsReady.whatsapp ? (
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    connecté
                                </span>
                            ) : (
                                <span>non connecté</span>
                            )}
                        </span>
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                        label="Envoyés"
                        value={count(totals.sent)}
                        icon={CheckCircle2}
                        tone="success"
                    />
                    <StatCard
                        label="En attente"
                        value={count(totals.pending)}
                        icon={Clock}
                        tone={totals.pending > 0 ? 'warning' : 'default'}
                    />
                    <StatCard
                        label="Échecs"
                        value={count(totals.failed)}
                        hint={
                            totals.failed > 0
                                ? 'Cliquez pour voir la raison'
                                : undefined
                        }
                        icon={TriangleAlert}
                        tone={totals.failed > 0 ? 'danger' : 'default'}
                    />
                </div>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Destinataire, objet, contenu…"
                    onReset={reset}
                    isFiltered={isFiltered}
                >
                    <FilterSelect
                        value={values.type}
                        onChange={(value) => set('type', value, true)}
                        options={types}
                        allLabel="Tous les types"
                        width="sm:w-48"
                    />
                    <FilterSelect
                        value={values.canal}
                        onChange={(value) => set('canal', value, true)}
                        options={channels}
                        allLabel="Tous les canaux"
                        width="sm:w-36"
                    />
                    <FilterSelect
                        value={values.statut}
                        onChange={(value) => set('statut', value, true)}
                        options={statuses}
                        allLabel="Tous statuts"
                        width="sm:w-36"
                    />
                    <Input
                        type="date"
                        value={values.du}
                        onChange={(event) =>
                            set('du', event.target.value, true)
                        }
                        className="h-10 w-full sm:h-8 sm:w-38"
                        aria-label="Du"
                    />
                    <Input
                        type="date"
                        value={values.au}
                        onChange={(event) =>
                            set('au', event.target.value, true)
                        }
                        className="h-10 w-full sm:h-8 sm:w-38"
                        aria-label="Au"
                    />
                </FilterBar>

                <DataList
                    rows={messages.data}
                    getKey={(message) => message.id}
                    columns={[
                        {
                            key: 'destinataire',
                            header: 'Destinataire',
                            cell: (message) => (
                                <button
                                    type="button"
                                    onClick={() => setOpened(message)}
                                    className="block text-left"
                                >
                                    <span className="font-medium">
                                        {message.recipientName ??
                                            message.recipient}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {message.recipient}
                                        {message.batchLabel
                                            ? ` · ${message.batchLabel}`
                                            : ''}
                                    </span>
                                </button>
                            ),
                        },
                        {
                            key: 'type',
                            header: 'Type',
                            className: 'text-sm text-muted-foreground',
                            cell: (message) => message.typeLabel,
                        },
                        {
                            key: 'canal',
                            header: 'Canal',
                            className: 'text-sm text-muted-foreground',
                            cell: (message) => message.channelLabel,
                        },
                        {
                            key: 'envoye',
                            header: 'Envoyé',
                            className:
                                'text-sm whitespace-nowrap text-muted-foreground',
                            cell: (message) =>
                                dateTime(message.sentAt ?? message.createdAt),
                        },
                        {
                            key: 'statut',
                            header: 'Statut',
                            cell: (message) => (
                                <StatusBadge
                                    label={message.statusLabel}
                                    tone={message.statusTone}
                                />
                            ),
                        },
                        {
                            key: 'relance',
                            header: '',
                            headClassName: 'w-10',
                            cell: (message) => <Relance message={message} />,
                        },
                    ]}
                    tile={(message) => (
                        <button
                            type="button"
                            onClick={() => setOpened(message)}
                            className="block w-full space-y-2 text-left"
                        >
                            <TileHeader
                                title={
                                    message.recipientName ?? message.recipient
                                }
                                subtitle={`${message.recipient}${message.batchLabel ? ` · ${message.batchLabel}` : ''}`}
                                trailing={
                                    <StatusBadge
                                        label={message.statusLabel}
                                        tone={message.statusTone}
                                    />
                                }
                            />
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">
                                    {message.typeLabel} ·{' '}
                                    {message.channelLabel} ·{' '}
                                    {dateTime(
                                        message.sentAt ?? message.createdAt,
                                    )}
                                </span>
                                <Relance message={message} />
                            </div>
                        </button>
                    )}
                    empty={
                        <EmptyState
                            icon={MessageSquare}
                            title="Aucun message"
                            description={
                                isFiltered
                                    ? 'Aucun message ne correspond à ces filtres.'
                                    : 'Les messages envoyés aux clients apparaîtront ici.'
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={messages.links}
                            from={messages.from}
                            to={messages.to}
                            total={messages.total}
                            label="messages"
                        />
                    }
                />
            </div>

            <Dialog
                open={opened !== null}
                onOpenChange={(open) => !open && setOpened(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {opened?.subject || opened?.typeLabel}
                        </DialogTitle>
                        <DialogDescription>
                            {opened?.channelLabel} à{' '}
                            {opened?.recipientName ?? opened?.recipient} (
                            {opened?.recipient})
                        </DialogDescription>
                    </DialogHeader>

                    <p className="max-h-72 overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">
                        {opened?.body}
                    </p>

                    {opened?.error ? (
                        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                            {opened.error}
                        </p>
                    ) : null}

                    <DialogFooter className="sm:justify-between">
                        <span className="self-center text-xs text-muted-foreground">
                            {opened?.author ? `Par ${opened.author} · ` : ''}
                            {dateTime(opened?.createdAt)}
                        </span>
                        <div className="flex gap-2">
                            {opened?.status === 'echec' ? (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        router.post(
                                            `/messages/${opened.id}/relancer`,
                                            {},
                                            { preserveScroll: true },
                                        );
                                        setOpened(null);
                                    }}
                                >
                                    <RotateCw className="size-4" />
                                    Réessayer
                                </Button>
                            ) : null}
                            <Button onClick={() => setOpened(null)}>
                                Fermer
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/**
 * Réessayer un envoi. Le clic ne doit pas rouvrir le message : sur la tuile,
 * le bouton est posé au milieu d'une zone déjà cliquable.
 */
function Relance({ message }: { message: MessageRow }) {
    if (message.status !== 'echec') {
        return null;
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={(event) => {
                event.stopPropagation();
                router.post(
                    `/messages/${message.id}/relancer`,
                    {},
                    { preserveScroll: true },
                );
            }}
            aria-label="Réessayer"
        >
            <RotateCw className="size-4" />
        </Button>
    );
}

MessagesIndex.layout = {
    breadcrumbs: [{ title: 'Messages', href: '/messages' }],
};
