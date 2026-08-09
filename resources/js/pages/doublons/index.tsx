import { Head, router } from '@inertiajs/react';
import { CheckCircle2, CopyCheck, Merge, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { count, date } from '@/lib/format';
import { cn } from '@/lib/utils';

type Item = {
    id: number;
    name: string;
    reference: string;
    detail: string;
    counts: Array<{ label: string; value: number }>;
    createdAt: string | null;
};

type Group = {
    key: string;
    label: string;
    items: Item[];
};

const TABS = [
    { value: 'produits', label: 'Produits' },
    { value: 'clients', label: 'Clients' },
    { value: 'categories', label: 'Catégories' },
] as const;

/** Ce que la fusion déplace, selon le type de fiche. */
const EXPLANATIONS: Record<string, string> = {
    produits:
        'Les déclinaisons identiques (même taille, même couleur) sont regroupées et leurs quantités s’additionnent. Les autres sont rattachées au produit conservé.',
    clients:
        'Les ventes, devis, factures, bons de livraison et messages basculent sur la fiche conservée. Les informations manquantes y sont complétées.',
    categories: 'Les produits sont transférés vers la catégorie conservée.',
};

export default function DoublonsIndex({
    kind,
    groups,
    counts,
}: {
    kind: string;
    groups: Group[];
    counts: Record<string, number>;
}) {
    const [merging, setMerging] = useState<{
        group: Group;
        targetId: number;
        sourceIds: number[];
    } | null>(null);

    return (
        <>
            <Head title="Doublons" />

            <div className="flex flex-1 flex-col gap-5 p-4">
                <PageHeader
                    title="Doublons"
                    description="Fiches saisies deux fois. Choisissez celle à conserver : tout le reste bascule dessus."
                />

                <div className="flex flex-wrap items-center justify-between gap-3 border-b">
                    <nav className="-mb-px flex gap-1 overflow-x-auto">
                        {TABS.map((tab) => (
                            <button
                                key={tab.value}
                                type="button"
                                onClick={() =>
                                    router.get(
                                        '/doublons',
                                        { type: tab.value },
                                        {
                                            preserveState: true,
                                            preserveScroll: true,
                                            replace: true,
                                        },
                                    )
                                }
                                className={cn(
                                    'flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
                                    kind === tab.value
                                        ? 'border-primary font-medium text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {tab.label}
                                {counts[tab.value] > 0 ? (
                                    <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-medium text-amber-700 tabular-nums dark:text-amber-300">
                                        {counts[tab.value]}
                                    </span>
                                ) : null}
                            </button>
                        ))}
                    </nav>
                </div>

                {groups.length === 0 ? (
                    <div className="rounded-xl border bg-card shadow-sm">
                        <EmptyState
                            icon={CheckCircle2}
                            title="Aucun doublon détecté"
                            description={
                                kind === 'clients'
                                    ? 'Les clients sont rapprochés par leur téléphone, ou par leur nom s’il est absent.'
                                    : 'Les fiches sont rapprochées par leur nom, sans tenir compte des accents ni des majuscules.'
                            }
                        />
                    </div>
                ) : (
                    <>
                        <p className="flex items-start gap-2 text-sm text-muted-foreground">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                            {EXPLANATIONS[kind]} La fusion est définitive.
                        </p>

                        <div className="grid gap-4">
                            {groups.map((group) => (
                                <GroupCard
                                    key={group.key}
                                    group={group}
                                    onMerge={(targetId, sourceIds) =>
                                        setMerging({
                                            group,
                                            targetId,
                                            sourceIds,
                                        })
                                    }
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            <Dialog
                open={merging !== null}
                onOpenChange={(open) => !open && setMerging(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmer la fusion</DialogTitle>
                        <DialogDescription>
                            {merging
                                ? `${count(merging.sourceIds.length)} fiche(s) vont être fusionnées dans « ${
                                      merging.group.items.find(
                                          (item) =>
                                              item.id === merging.targetId,
                                      )?.name
                                  } », puis supprimées. ${EXPLANATIONS[kind]}`
                                : ''}
                        </DialogDescription>
                    </DialogHeader>

                    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                        Cette opération ne peut pas être annulée.
                    </p>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setMerging(null)}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={() => {
                                if (!merging) {
                                    return;
                                }

                                router.post(
                                    '/doublons/fusionner',
                                    {
                                        type: kind,
                                        target_id: merging.targetId,
                                        source_ids: merging.sourceIds,
                                    },
                                    { onFinish: () => setMerging(null) },
                                );
                            }}
                        >
                            <Merge className="size-4" />
                            Fusionner
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/**
 * Un groupe de fiches jugées identiques.
 *
 * On coche celle qui reste (bouton radio) et celles à absorber (cases) :
 * l'action reste explicite, rien n'est fusionné par déduction.
 */
function GroupCard({
    group,
    onMerge,
}: {
    group: Group;
    onMerge: (targetId: number, sourceIds: number[]) => void;
}) {
    const [targetId, setTargetId] = useState(group.items[0]?.id ?? 0);
    const [sourceIds, setSourceIds] = useState<number[]>(
        group.items.slice(1).map((item) => item.id),
    );

    function chooseTarget(id: number) {
        setTargetId(id);
        // La fiche conservée ne peut pas être aussi une fiche absorbée.
        setSourceIds((current) => current.filter((item) => item !== id));
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <CopyCheck className="size-4 text-muted-foreground" />
                    {group.label}
                    <span className="text-sm font-normal text-muted-foreground">
                        — {group.items.length} fiches
                    </span>
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
                <ul className="divide-y rounded-lg border">
                    {group.items.map((item) => {
                        const isTarget = item.id === targetId;

                        return (
                            <li
                                key={item.id}
                                className={cn(
                                    'flex flex-wrap items-center gap-3 px-3 py-2.5',
                                    isTarget && 'bg-emerald-500/5',
                                )}
                            >
                                <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                        type="radio"
                                        name={`target-${group.key}`}
                                        checked={isTarget}
                                        onChange={() => chooseTarget(item.id)}
                                        className="size-4 accent-primary"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        {isTarget ? 'À conserver' : 'Conserver'}
                                    </span>
                                </label>

                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">
                                        {item.name}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {item.reference}
                                        {item.detail ? ` · ${item.detail}` : ''}
                                        {item.createdAt
                                            ? ` · créé le ${date(item.createdAt)}`
                                            : ''}
                                    </span>
                                </span>

                                <span className="flex shrink-0 gap-3 text-xs text-muted-foreground tabular-nums">
                                    {item.counts.map((entry) => (
                                        <span key={entry.label}>
                                            {count(entry.value)} {entry.label}
                                        </span>
                                    ))}
                                </span>

                                {!isTarget ? (
                                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs">
                                        <Checkbox
                                            checked={sourceIds.includes(
                                                item.id,
                                            )}
                                            onCheckedChange={(checked) =>
                                                setSourceIds((current) =>
                                                    checked === true
                                                        ? [...current, item.id]
                                                        : current.filter(
                                                              (id) =>
                                                                  id !==
                                                                  item.id,
                                                          ),
                                                )
                                            }
                                        />
                                        Fusionner
                                    </label>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>

                <div className="flex justify-end">
                    <Button
                        size="sm"
                        disabled={sourceIds.length === 0}
                        onClick={() => onMerge(targetId, sourceIds)}
                    >
                        <Merge className="size-4" />
                        Fusionner {count(sourceIds.length)} fiche
                        {sourceIds.length > 1 ? 's' : ''}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

DoublonsIndex.layout = {
    breadcrumbs: [{ title: 'Doublons', href: '/doublons' }],
};
