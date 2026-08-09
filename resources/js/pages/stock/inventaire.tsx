import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, ClipboardList, Loader2, ScanLine } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
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
import { count } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IdOption } from '@/types';

type Row = {
    id: number;
    label: string;
    sku: string;
    barcode: string | null;
    stock: number;
};

export default function Inventaire({
    variants,
    filters,
    categories,
}: {
    variants: Row[];
    filters: Record<string, string | undefined>;
    categories: IdOption[];
}) {
    const { values, set, reset, isFiltered } = useFilters('/stock/inventaire', {
        recherche: filters.recherche ?? '',
        categorie: filters.categorie ?? '',
    });

    const [counted, setCounted] = useState<Record<number, string>>({});
    const [note, setNote] = useState('');
    const [scan, setScan] = useState('');
    const [processing, setProcessing] = useState(false);
    const scanRef = useRef<HTMLInputElement>(null);

    const gaps = useMemo(() => {
        return variants
            .map((variant) => {
                const value = counted[variant.id];

                if (value === undefined || value === '') {
                    return null;
                }

                const difference = Number(value) - variant.stock;

                return difference === 0 ? null : { variant, difference };
            })
            .filter(Boolean) as Array<{ variant: Row; difference: number }>;
    }, [counted, variants]);

    const filledCount = Object.values(counted).filter(
        (value) => value !== '',
    ).length;

    /** Le scan incrémente le comptage : on passe devant le rayon, on scanne. */
    function handleScan(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        const needle = scan.trim();

        if (needle === '') {
            return;
        }

        const match = variants.find(
            (variant) => variant.barcode === needle || variant.sku === needle,
        );

        if (!match) {
            toast.error(`Article introuvable pour « ${needle} ».`);
            setScan('');

            return;
        }

        setCounted((current) => {
            const previous = current[match.id];
            const next =
                (previous === undefined || previous === ''
                    ? 0
                    : Number(previous)) + 1;

            return { ...current, [match.id]: String(next) };
        });

        toast.success(`${match.label} comptée`);
        setScan('');
    }

    function submit() {
        const rows = Object.entries(counted)
            .filter(([, value]) => value !== '')
            .map(([id, value]) => ({
                product_variant_id: Number(id),
                counted: Number(value),
            }));

        if (rows.length === 0) {
            toast.error('Saisissez au moins un comptage.');

            return;
        }

        setProcessing(true);

        router.post(
            '/stock/inventaire',
            { counts: rows, note: note || null },
            { onFinish: () => setProcessing(false) },
        );
    }

    return (
        <>
            <Head title="Inventaire" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Inventaire physique"
                    description="Saisissez la quantité réellement comptée. Seuls les écarts génèrent un mouvement de stock."
                    actions={
                        <>
                            <Button asChild variant="outline">
                                <Link href="/stock">
                                    <ArrowLeft className="size-4" />
                                    Retour
                                </Link>
                            </Button>
                            <Button
                                onClick={submit}
                                disabled={filledCount === 0 || processing}
                            >
                                {processing ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Valider l'inventaire
                            </Button>
                        </>
                    }
                />

                <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                        label="Articles listés"
                        value={count(variants.length)}
                        icon={ClipboardList}
                    />
                    <StatCard
                        label="Comptages saisis"
                        value={count(filledCount)}
                        hint="Les lignes vides sont ignorées"
                    />
                    <StatCard
                        label="Écarts détectés"
                        value={count(gaps.length)}
                        tone={gaps.length > 0 ? 'warning' : 'success'}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-64 flex-1 sm:max-w-sm">
                        <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            ref={scanRef}
                            autoFocus
                            value={scan}
                            onChange={(event) => setScan(event.target.value)}
                            onKeyDown={handleScan}
                            placeholder="Scanner pour compter (+1 à chaque scan)…"
                            className="pl-8"
                        />
                    </div>

                    <FilterBar
                        search={values.recherche}
                        onSearch={(value) => set('recherche', value)}
                        placeholder="Filtrer la liste…"
                        onReset={reset}
                        isFiltered={isFiltered}
                    >
                        <FilterSelect
                            value={values.categorie}
                            onChange={(value) => set('categorie', value, true)}
                            options={categories.map((c) => ({
                                value: c.id,
                                label: c.name,
                            }))}
                            allLabel="Toutes catégories"
                        />
                    </FilterBar>
                </div>

                <div className="rounded-xl border bg-card shadow-sm">
                    {variants.length === 0 ? (
                        <EmptyState
                            icon={ClipboardList}
                            title="Aucun article à inventorier"
                            description="Ajustez les filtres ou créez des produits."
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Article</TableHead>
                                    <TableHead className="text-right">
                                        Stock théorique
                                    </TableHead>
                                    <TableHead className="w-36 text-right">
                                        Compté
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Écart
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {variants.map((variant) => {
                                    const value = counted[variant.id] ?? '';
                                    const difference =
                                        value === ''
                                            ? null
                                            : Number(value) - variant.stock;

                                    return (
                                        <TableRow key={variant.id}>
                                            <TableCell>
                                                <span className="font-medium">
                                                    {variant.label}
                                                </span>
                                                <span className="block font-mono text-xs text-muted-foreground">
                                                    {variant.sku}
                                                    {variant.barcode
                                                        ? ` · ${variant.barcode}`
                                                        : ''}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {variant.stock}
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={value}
                                                    onChange={(event) =>
                                                        setCounted(
                                                            (current) => ({
                                                                ...current,
                                                                [variant.id]:
                                                                    event.target.value.replace(
                                                                        /\D/g,
                                                                        '',
                                                                    ),
                                                            }),
                                                        )
                                                    }
                                                    placeholder="—"
                                                    inputMode="numeric"
                                                    className="h-8 text-right tabular-nums"
                                                />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {difference === null ? (
                                                    <span className="text-muted-foreground">
                                                        —
                                                    </span>
                                                ) : (
                                                    <span
                                                        className={cn(
                                                            'font-medium tabular-nums',
                                                            difference === 0
                                                                ? 'text-muted-foreground'
                                                                : difference > 0
                                                                  ? 'text-emerald-600 dark:text-emerald-400'
                                                                  : 'text-red-600 dark:text-red-400',
                                                        )}
                                                    >
                                                        {difference > 0
                                                            ? '+'
                                                            : ''}
                                                        {difference}
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="note">Note d'inventaire</Label>
                    <Textarea
                        id="note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Inventaire du mois, contrôle après arrivage…"
                        rows={2}
                        className="max-w-xl"
                    />
                </div>
            </div>
        </>
    );
}

Inventaire.layout = {
    breadcrumbs: [
        { title: 'Stock', href: '/stock' },
        { title: 'Inventaire', href: '/stock/inventaire' },
    ],
};
