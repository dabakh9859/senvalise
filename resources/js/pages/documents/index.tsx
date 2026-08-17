import { Head, Link } from '@inertiajs/react';
import { FilePlus2, FileText, ShoppingCart, Truck } from 'lucide-react';
import { useState } from 'react';
import { DataList, TileHeader } from '@/components/data-list';
import { DataPagination } from '@/components/data-pagination';
import { EmptyState } from '@/components/empty-state';
import { FilterBar, FilterSelect } from '@/components/filter-bar';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Comptoir } from '@/components/vente/comptoir';
import { useFilters } from '@/hooks/use-filters';
import { date, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IdOption, Option, Paginated, StatusTone } from '@/types';

type DocumentRow = {
    id: number;
    type: string;
    typeLabel: string;
    reference: string;
    customer: string | null;
    issueDate: string | null;
    dueDate: string | null;
    validUntil: string | null;
    total: number;
    amountPaid: number;
    balanceDue: number;
    status: string;
    statusLabel: string;
    statusTone: StatusTone;
    author: string | null;
};

type CatalogueItem = {
    id: number;
    label: string;
    productName: string | null;
    variantLabel: string;
    sku: string;
    barcode: string | null;
    price: number;
    stock: number;
    categoryId: number | null;
};

type CustomerOption = { id: number; name: string; phone: string | null };

/** Onglets de type : plus lisibles qu'une liste déroulante de filtre. */
const TABS = [
    { value: '', label: 'Tout' },
    { value: 'devis', label: 'Devis' },
    { value: 'facture', label: 'Factures' },
    { value: 'bon_livraison', label: 'Bons de livraison' },
];

export default function DocumentsIndex({
    documents,
    filters,
    statuses,
    totals,
    catalogue,
    categories,
    customers,
    paymentMethods,
    allowNegativeStock,
    openCounter,
}: {
    documents: Paginated<DocumentRow>;
    filters: Record<string, string | undefined>;
    types: Option[];
    statuses: Option[];
    totals: { count: number; total: number; paid: number; due: number };
    catalogue: CatalogueItem[];
    categories: IdOption[];
    customers: CustomerOption[];
    paymentMethods: Option[];
    allowNegativeStock: boolean;
    openCounter: boolean;
}) {
    // L'ancienne adresse /vente et le bouton « Encaisser » de l'accueil
    // arrivent ici avec ?vente=1 : le comptoir est alors déjà ouvert.
    const [venteOuverte, setVenteOuverte] = useState(openCounter);
    const { values, set, reset, isFiltered } = useFilters('/documents', {
        recherche: filters.recherche ?? '',
        type: filters.type ?? '',
        statut: filters.statut ?? '',
        du: filters.du ?? '',
        au: filters.au ?? '',
    });

    return (
        <>
            <Head title="Ventes, factures & devis" />

            <Dialog open={venteOuverte} onOpenChange={setVenteOuverte}>
                {/*
                 * Presque plein écran : le comptoir a besoin de la grille du
                 * catalogue et du panier côte à côte, une fenêtre étroite
                 * ramènerait le vendeur à faire défiler pour encaisser.
                 */}
                {/*
                 * sm:max-w-[1600px] est indispensable : la classe de base du
                 * composant pose sm:max-w-lg, et une largeur sans variante ne
                 * l'emporterait pas au-delà de 640 px.
                 */}
                <DialogContent className="flex h-[92svh] w-[98vw] max-w-[98vw] flex-col gap-3 p-4 sm:max-w-[1600px] sm:p-5">
                    <DialogHeader className="space-y-0.5 text-left">
                        <DialogTitle className="flex items-center gap-2">
                            <ShoppingCart className="size-5" />
                            Nouvelle vente
                        </DialogTitle>
                        <DialogDescription>
                            Scannez ou choisissez les articles. L'encaissement
                            édite la facture dans la foulée.
                        </DialogDescription>
                    </DialogHeader>

                    <Comptoir
                        catalogue={catalogue}
                        categories={categories}
                        customers={customers}
                        paymentMethods={paymentMethods}
                        allowNegativeStock={allowNegativeStock}
                        onEncaisse={() => setVenteOuverte(false)}
                    />
                </DialogContent>
            </Dialog>

            <div className="flex flex-1 flex-col gap-5 p-4">
                <PageHeader
                    title="Ventes & factures"
                    description="Encaissez au comptoir, la facture suit. Les devis et bons de livraison se créent aussi d'ici."
                    actions={
                        <>
                            <Button onClick={() => setVenteOuverte(true)}>
                                <ShoppingCart className="size-4" />
                                Nouvelle vente
                            </Button>
                            <Button asChild variant="outline">
                                <Link href="/documents/nouveau?type=devis">
                                    <FilePlus2 className="size-4" />
                                    Nouveau devis
                                </Link>
                            </Button>
                            <Button asChild variant="outline">
                                <Link href="/documents/nouveau?type=bon_livraison">
                                    <Truck className="size-4" />
                                    Bon de livraison
                                </Link>
                            </Button>
                            <Button asChild variant="outline">
                                <Link href="/documents/nouveau?type=facture">
                                    <FileText className="size-4" />
                                    Facture manuelle
                                </Link>
                            </Button>
                        </>
                    }
                />

                {/* Onglets de type */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b">
                    <nav className="-mb-px flex gap-1 overflow-x-auto">
                        {TABS.map((tab) => {
                            const active = (values.type ?? '') === tab.value;

                            return (
                                <button
                                    key={tab.value || 'tout'}
                                    type="button"
                                    onClick={() => set('type', tab.value, true)}
                                    className={cn(
                                        'border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
                                        active
                                            ? 'border-primary font-medium text-foreground'
                                            : 'border-transparent text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>

                    {totals.due > 0 ? (
                        <p className="pb-2 text-sm">
                            <span className="text-muted-foreground">
                                Reste à encaisser :{' '}
                            </span>
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                                {money(totals.due)}
                            </span>
                        </p>
                    ) : null}
                </div>

                <FilterBar
                    search={values.recherche}
                    onSearch={(value) => set('recherche', value)}
                    placeholder="Numéro, client ou téléphone…"
                    onReset={reset}
                    isFiltered={isFiltered}
                >
                    <FilterSelect
                        value={values.statut}
                        onChange={(value) => set('statut', value, true)}
                        options={statuses}
                        allLabel="Tous statuts"
                        width="sm:w-44"
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
                    rows={documents.data}
                    getKey={(document) => document.id}
                    tileHref={(document) => `/documents/${document.id}`}
                    columns={[
                        {
                            key: 'numero',
                            header: 'Numéro',
                            cell: (document) => (
                                <>
                                    <Link
                                        href={`/documents/${document.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {document.reference}
                                    </Link>
                                    <span className="block text-xs text-muted-foreground">
                                        {document.typeLabel}
                                    </span>
                                </>
                            ),
                        },
                        {
                            key: 'client',
                            header: 'Client',
                            className: 'text-sm',
                            cell: (document) =>
                                document.customer ?? (
                                    <span className="text-muted-foreground">
                                        —
                                    </span>
                                ),
                        },
                        {
                            key: 'date',
                            header: 'Date',
                            className:
                                'text-sm whitespace-nowrap text-muted-foreground',
                            cell: (document) => (
                                <>
                                    {date(document.issueDate)}
                                    {echeance(document) ? (
                                        <span className="block text-xs">
                                            {echeance(document)}
                                        </span>
                                    ) : null}
                                </>
                            ),
                        },
                        {
                            key: 'total',
                            header: 'Total',
                            align: 'right',
                            className: 'font-medium',
                            cell: (document) => money(document.total),
                        },
                        {
                            key: 'reste',
                            header: 'Reste dû',
                            align: 'right',
                            cell: (document) =>
                                document.balanceDue > 0 ? (
                                    <span className="text-amber-600 dark:text-amber-400">
                                        {money(document.balanceDue)}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">
                                        —
                                    </span>
                                ),
                        },
                        {
                            key: 'statut',
                            header: 'Statut',
                            cell: (document) => (
                                <StatusBadge
                                    label={document.statusLabel}
                                    tone={document.statusTone}
                                />
                            ),
                        },
                    ]}
                    tile={(document) => (
                        <div className="space-y-2">
                            <TileHeader
                                title={document.reference}
                                subtitle={`${document.typeLabel} · ${document.customer ?? 'sans client'}`}
                                trailing={
                                    <>
                                        <span className="block text-sm font-semibold tabular-nums">
                                            {money(document.total)}
                                        </span>
                                        {document.balanceDue > 0 ? (
                                            <span className="block text-xs text-amber-600 tabular-nums dark:text-amber-400">
                                                reste{' '}
                                                {money(document.balanceDue)}
                                            </span>
                                        ) : null}
                                    </>
                                }
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <StatusBadge
                                    label={document.statusLabel}
                                    tone={document.statusTone}
                                />
                                <span className="text-xs text-muted-foreground">
                                    {date(document.issueDate)}
                                    {echeance(document)
                                        ? ` · ${echeance(document)}`
                                        : ''}
                                </span>
                            </div>
                        </div>
                    )}
                    empty={
                        <EmptyState
                            icon={FileText}
                            title="Aucun document"
                            description={
                                isFiltered
                                    ? 'Aucun document ne correspond à ces filtres.'
                                    : 'Créez un devis, une facture ou un bon de livraison.'
                            }
                        />
                    }
                    footer={
                        <DataPagination
                            links={documents.links}
                            from={documents.from}
                            to={documents.to}
                            total={documents.total}
                            label="documents"
                        />
                    }
                />
            </div>
        </>
    );
}

/** « échéance 12/09/2026 » ou « valable jusqu'au … », selon le type de document. */
function echeance(document: DocumentRow): string | null {
    if (document.type === 'devis' && document.validUntil) {
        return `valable jusqu’au ${date(document.validUntil)}`;
    }

    if (document.type === 'facture' && document.dueDate) {
        return `échéance ${date(document.dueDate)}`;
    }

    return null;
}

DocumentsIndex.layout = {
    breadcrumbs: [{ title: 'Ventes & factures', href: '/documents' }],
};
