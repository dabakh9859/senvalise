import { Head } from '@inertiajs/react';
import { Barcode, Minus, Plus, Printer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useFilters } from '@/hooks/use-filters';
import { count, money } from '@/lib/format';
import type { IdOption, Paginated } from '@/types';

type LabelRow = {
    id: number;
    label: string;
    sku: string;
    barcode: string | null;
    barcodeReadable: string | null;
    price: number;
    stock: number;
};

type FormatOption = {
    value: string;
    label: string;
    perPage: number;
};

/** Sélection conservée d'une page de résultats à l'autre. */
const STORAGE_KEY = 'senvalise.labels.selection';

type Selection = Record<number, { quantity: number; label: string }>;

function readSelection(): Selection {
    const stored = sessionStorage.getItem(STORAGE_KEY);

    if (!stored) {
        return {};
    }

    try {
        return JSON.parse(stored) as Selection;
    } catch {
        sessionStorage.removeItem(STORAGE_KEY);

        return {};
    }
}

export default function EtiquettesIndex({
    variants,
    filters,
    categories,
    formats,
}: {
    variants: Paginated<LabelRow>;
    filters: Record<string, string | undefined>;
    categories: IdOption[];
    formats: FormatOption[];
}) {
    const { values, set, reset, isFiltered } = useFilters('/etiquettes', {
        recherche: filters.recherche ?? '',
        categorie: filters.categorie ?? '',
        etat: filters.etat ?? '',
    });

    // La sélection est relue au premier rendu : passer d'une page de résultats
    // à l'autre ne doit pas faire perdre les articles déjà cochés.
    const [selection, setSelection] = useState<Selection>(readSelection);
    const [format, setFormat] = useState(formats[0]?.value ?? 'a4-3x8');
    const [showPrice, setShowPrice] = useState(true);
    const [showName, setShowName] = useState(true);

    useEffect(() => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    }, [selection]);

    const selectedIds = Object.keys(selection).map(Number);
    const totalLabels = Object.values(selection).reduce(
        (sum, entry) => sum + entry.quantity,
        0,
    );
    const selectedFormat = formats.find((f) => f.value === format);
    const sheets = selectedFormat?.perPage
        ? Math.ceil(totalLabels / selectedFormat.perPage)
        : 0;

    function toggle(row: LabelRow, checked: boolean) {
        setSelection((current) => {
            if (!checked) {
                const next = { ...current };
                delete next[row.id];

                return next;
            }

            return {
                ...current,
                [row.id]: {
                    quantity: current[row.id]?.quantity ?? 1,
                    label: row.label,
                },
            };
        });
    }

    function setQuantity(id: number, quantity: number) {
        setSelection((current) => {
            if (!current[id]) {
                return current;
            }

            return {
                ...current,
                [id]: {
                    ...current[id],
                    quantity: Math.max(1, Math.min(200, quantity)),
                },
            };
        });
    }

    function selectAllOnPage() {
        setSelection((current) => {
            const next = { ...current };

            for (const row of variants.data) {
                if (!next[row.id] && row.barcode) {
                    next[row.id] = { quantity: 1, label: row.label };
                }
            }

            return next;
        });
    }

    function sheetUrl() {
        const ids = selectedIds.join(',');
        const quantities = selectedIds
            .map((id) => `${id}:${selection[id].quantity}`)
            .join(',');

        return `/etiquettes/planche?ids=${ids}&quantites=${quantities}&format=${format}&prix=${showPrice ? 1 : 0}&nom=${showName ? 1 : 0}`;
    }

    return (
        <>
            <Head title="Étiquettes code-barres" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Étiquettes code-barres"
                    description="Sélectionnez les articles, indiquez le nombre d'étiquettes, puis imprimez la planche."
                />

                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                    <div className="flex min-w-0 flex-col gap-3">
                        <FilterBar
                            search={values.recherche}
                            onSearch={(value) => set('recherche', value)}
                            placeholder="Nom, SKU ou code-barres…"
                            onReset={reset}
                            isFiltered={isFiltered}
                        >
                            <FilterSelect
                                value={values.categorie}
                                onChange={(value) =>
                                    set('categorie', value, true)
                                }
                                options={categories.map((c) => ({
                                    value: c.id,
                                    label: c.name,
                                }))}
                                allLabel="Toutes catégories"
                            />
                            <FilterSelect
                                value={values.etat}
                                onChange={(value) => set('etat', value, true)}
                                options={[
                                    {
                                        value: 'sans-code',
                                        label: 'Sans code-barres',
                                    },
                                ]}
                                allLabel="Tous les articles"
                                width="sm:w-44"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={selectAllOnPage}
                            >
                                Tout cocher (page)
                            </Button>
                        </FilterBar>

                        <div className="rounded-xl border bg-card shadow-sm">
                            {variants.data.length === 0 ? (
                                <EmptyState
                                    icon={Barcode}
                                    title="Aucun article"
                                    description="Ajustez la recherche ou les filtres."
                                />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-10" />
                                            <TableHead>Article</TableHead>
                                            <TableHead>Code-barres</TableHead>
                                            <TableHead className="text-right">
                                                Stock
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Prix
                                            </TableHead>
                                            <TableHead className="w-36 text-right">
                                                Étiquettes
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {variants.data.map((row) => {
                                            const isSelected = Boolean(
                                                selection[row.id],
                                            );

                                            return (
                                                <TableRow
                                                    key={row.id}
                                                    data-state={
                                                        isSelected
                                                            ? 'selected'
                                                            : undefined
                                                    }
                                                >
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={isSelected}
                                                            disabled={
                                                                !row.barcode
                                                            }
                                                            onCheckedChange={(
                                                                checked,
                                                            ) =>
                                                                toggle(
                                                                    row,
                                                                    checked ===
                                                                        true,
                                                                )
                                                            }
                                                            aria-label={`Sélectionner ${row.label}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="font-medium">
                                                            {row.label}
                                                        </span>
                                                        <span className="block font-mono text-xs text-muted-foreground">
                                                            {row.sku}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        {row.barcodeReadable ?? (
                                                            <span className="text-destructive">
                                                                Aucun
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                                                        {row.stock}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm tabular-nums">
                                                        {money(row.price)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {isSelected ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="size-7"
                                                                    onClick={() =>
                                                                        setQuantity(
                                                                            row.id,
                                                                            selection[
                                                                                row
                                                                                    .id
                                                                            ]
                                                                                .quantity -
                                                                                1,
                                                                        )
                                                                    }
                                                                >
                                                                    <Minus className="size-3.5" />
                                                                </Button>
                                                                <Input
                                                                    value={String(
                                                                        selection[
                                                                            row
                                                                                .id
                                                                        ]
                                                                            .quantity,
                                                                    )}
                                                                    onChange={(
                                                                        event,
                                                                    ) =>
                                                                        setQuantity(
                                                                            row.id,
                                                                            Number(
                                                                                event.target.value.replace(
                                                                                    /\D/g,
                                                                                    '',
                                                                                ),
                                                                            ) ||
                                                                                1,
                                                                        )
                                                                    }
                                                                    className="h-7 w-14 text-center tabular-nums"
                                                                    inputMode="numeric"
                                                                />
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="size-7"
                                                                    onClick={() =>
                                                                        setQuantity(
                                                                            row.id,
                                                                            selection[
                                                                                row
                                                                                    .id
                                                                            ]
                                                                                .quantity +
                                                                                1,
                                                                        )
                                                                    }
                                                                >
                                                                    <Plus className="size-3.5" />
                                                                </Button>
                                                            </div>
                                                        ) : null}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}

                            <div className="px-4 pb-3">
                                <DataPagination
                                    links={variants.links}
                                    from={variants.from}
                                    to={variants.to}
                                    total={variants.total}
                                    label="articles"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Panneau d'impression */}
                    <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Planche à imprimer
                                </CardTitle>
                                <CardDescription>
                                    {selectedIds.length === 0
                                        ? 'Aucun article sélectionné.'
                                        : `${count(selectedIds.length)} article${selectedIds.length > 1 ? 's' : ''} · ${count(totalLabels)} étiquette${totalLabels > 1 ? 's' : ''}${sheets > 0 ? ` · ${sheets} page${sheets > 1 ? 's' : ''}` : ''}`}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="format">
                                        Format de papier
                                    </Label>
                                    <Select
                                        value={format}
                                        onValueChange={setFormat}
                                    >
                                        <SelectTrigger
                                            id="format"
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {formats.map((option) => (
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

                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={showName}
                                            onCheckedChange={(checked) =>
                                                setShowName(checked === true)
                                            }
                                        />
                                        Afficher le nom de l'article
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={showPrice}
                                            onCheckedChange={(checked) =>
                                                setShowPrice(checked === true)
                                            }
                                        />
                                        Afficher le prix
                                    </label>
                                </div>

                                <Button
                                    asChild={selectedIds.length > 0}
                                    disabled={selectedIds.length === 0}
                                    className="w-full"
                                >
                                    {selectedIds.length > 0 ? (
                                        <a
                                            href={sheetUrl()}
                                            target="_blank"
                                            rel="noopener"
                                        >
                                            <Printer className="size-4" />
                                            Générer la planche
                                        </a>
                                    ) : (
                                        <span>
                                            <Printer className="size-4" />
                                            Générer la planche
                                        </span>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>

                        {selectedIds.length > 0 ? (
                            <Card>
                                <CardHeader className="flex-row items-center justify-between">
                                    <CardTitle className="text-base">
                                        Sélection
                                    </CardTitle>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSelection({})}
                                        className="text-muted-foreground"
                                    >
                                        Tout vider
                                    </Button>
                                </CardHeader>
                                <CardContent className="max-h-80 space-y-1 overflow-y-auto px-3">
                                    {selectedIds.map((id) => (
                                        <div
                                            key={id}
                                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm"
                                        >
                                            <span className="min-w-0 truncate">
                                                {selection[id].label}
                                            </span>
                                            <span className="flex shrink-0 items-center gap-2">
                                                <span className="text-muted-foreground tabular-nums">
                                                    ×{selection[id].quantity}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelection(
                                                            (current) => {
                                                                const next = {
                                                                    ...current,
                                                                };
                                                                delete next[id];

                                                                return next;
                                                            },
                                                        )
                                                    }
                                                    className="text-muted-foreground hover:text-destructive"
                                                    aria-label="Retirer"
                                                >
                                                    <X className="size-3.5" />
                                                </button>
                                            </span>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        ) : null}
                    </div>
                </div>
            </div>
        </>
    );
}

EtiquettesIndex.layout = {
    breadcrumbs: [{ title: 'Étiquettes', href: '/etiquettes' }],
};
