import { Head, router } from '@inertiajs/react';
import { CheckCircle2, Clock, Inbox, MailOpen } from 'lucide-react';
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
import { count, dateTime } from '@/lib/format';
import type { Option, Paginated } from '@/types';
import type { StatusTone } from '@/types/senvalise';

type ContactRow = {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    subject: string | null;
    body: string;
    status: string;
    statusLabel: string;
    statusTone: StatusTone;
    answer: string | null;
    responder: string | null;
    customerName: string | null;
    createdAt: string | null;
    answeredAt: string | null;
};

export default function ContactsIndex({
    messages,
    filters,
    statuses,
    totals,
}: {
    messages: Paginated<ContactRow>;
    filters: Record<string, string | undefined>;
    statuses: Option[];
    totals: { new: number; read: number; done: number };
}) {
    const { values, set, reset, isFiltered } = useFilters('/contacts', {
        recherche: filters.recherche ?? '',
        statut: filters.statut ?? '',
    });

    const [opened, setOpened] = useState<ContactRow | null>(null);
    const [answer, setAnswer] = useState('');
    const [status, setStatus] = useState('lu');

    function open(message: ContactRow) {
        setOpened(message);
        setAnswer(message.answer ?? '');
        setStatus(message.status === 'nouveau' ? 'lu' : message.status);
    }

    return (
        <>
            <Head title="Messages reçus" />

            <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
                <PageHeader
                    title="Messages reçus"
                    description="Ce que les visiteurs écrivent depuis la boutique en ligne."
                />

                <div className="grid grid-cols-3 gap-3">
                    <StatCard
                        label="Nouveaux"
                        value={count(totals.new)}
                        icon={Inbox}
                        tone={totals.new > 0 ? 'warning' : 'default'}
                    />
                    <StatCard
                        label="Lus"
                        value={count(totals.read)}
                        icon={MailOpen}
                        tone="info"
                    />
                    <StatCard
                        label="Traités"
                        value={count(totals.done)}
                        icon={CheckCircle2}
                        tone="success"
                    />
                </div>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Nom, téléphone, objet, contenu…"
                    onReset={reset}
                    isFiltered={isFiltered}
                >
                    <FilterSelect
                        value={values.statut}
                        onChange={(value) => set('statut', value, true)}
                        options={statuses}
                        allLabel="Tous statuts"
                        width="sm:w-40"
                    />
                </FilterBar>

                <DataList
                    rows={messages.data}
                    getKey={(message) => message.id}
                    columns={[
                        {
                            key: 'expediteur',
                            header: 'Expéditeur',
                            cell: (message) => (
                                <button
                                    type="button"
                                    onClick={() => open(message)}
                                    className="block text-left"
                                >
                                    <span className="font-medium">
                                        {message.name}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        {[message.phone, message.email]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                </button>
                            ),
                        },
                        {
                            key: 'objet',
                            header: 'Objet',
                            className: 'text-sm',
                            cell: (message) => (
                                <>
                                    {message.subject ?? 'Sans objet'}
                                    <span className="block max-w-md truncate text-xs text-muted-foreground">
                                        {message.body}
                                    </span>
                                </>
                            ),
                        },
                        {
                            key: 'recu',
                            header: 'Reçu',
                            hideBelow: 'xl',
                            className:
                                'text-sm whitespace-nowrap text-muted-foreground',
                            cell: (message) => dateTime(message.createdAt),
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
                    ]}
                    tile={(message) => (
                        <button
                            type="button"
                            onClick={() => open(message)}
                            className="block w-full space-y-2 text-left"
                        >
                            <TileHeader
                                title={message.name}
                                subtitle={message.subject ?? 'Sans objet'}
                                trailing={
                                    <StatusBadge
                                        label={message.statusLabel}
                                        tone={message.statusTone}
                                    />
                                }
                            />
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                                {message.body}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {dateTime(message.createdAt)}
                            </p>
                        </button>
                    )}
                    empty={
                        <EmptyState
                            icon={Inbox}
                            title="Aucun message"
                            description={
                                isFiltered
                                    ? 'Aucun message ne correspond à ces filtres.'
                                    : 'Les messages du formulaire de contact arriveront ici.'
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
                onOpenChange={(isOpen) => !isOpen && setOpened(null)}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {opened?.subject ?? 'Message'}
                        </DialogTitle>
                        <DialogDescription>
                            De {opened?.name}
                            {opened?.phone ? ` · ${opened.phone}` : ''}
                            {opened?.email ? ` · ${opened.email}` : ''}
                            {' — '}
                            {dateTime(opened?.createdAt)}
                        </DialogDescription>
                    </DialogHeader>

                    <p className="max-h-56 overflow-y-auto rounded-lg bg-muted p-3 text-sm whitespace-pre-line">
                        {opened?.body}
                    </p>

                    <div className="grid gap-2">
                        <Label htmlFor="answer">
                            Note interne / réponse apportée
                        </Label>
                        <Textarea
                            id="answer"
                            rows={3}
                            value={answer}
                            onChange={(event) => setAnswer(event.target.value)}
                            placeholder="Rappelé le 8 août, valise réservée."
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="statut">Statut</Label>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger id="statut" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="nouveau">Nouveau</SelectItem>
                                <SelectItem value="lu">Lu</SelectItem>
                                <SelectItem value="traite">Traité</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {opened?.responder ? (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            Dernière réponse par {opened.responder},{' '}
                            {dateTime(opened.answeredAt)}
                        </p>
                    ) : null}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (opened) {
                                    router.delete(`/contacts/${opened.id}`, {
                                        preserveScroll: true,
                                        onFinish: () => setOpened(null),
                                    });
                                }
                            }}
                            className="mr-auto text-destructive"
                        >
                            Supprimer
                        </Button>
                        <Button
                            onClick={() => {
                                if (opened) {
                                    router.put(
                                        `/contacts/${opened.id}`,
                                        { answer, status },
                                        {
                                            preserveScroll: true,
                                            onFinish: () => setOpened(null),
                                        },
                                    );
                                }
                            }}
                        >
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

ContactsIndex.layout = {
    breadcrumbs: [{ title: 'Messages reçus', href: '/contacts' }],
};
