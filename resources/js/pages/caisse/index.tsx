import { Head, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Barcode,
    Loader2,
    Minus,
    Plus,
    ShoppingCart,
    Trash2,
    UserPlus,
    UserRound,
    X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
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
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { amount, money, parseAmount } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IdOption, Option, SharedProps } from '@/types';

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

type CartLine = {
    variantId: number;
    label: string;
    sku: string;
    unitPrice: number;
    quantity: number;
    discount: number;
    stock: number;
};

type CustomerOption = {
    id: number;
    name: string;
    phone: string | null;
};

const NO_CUSTOMER = '__aucun__';
const ALL_CATEGORIES = '__toutes__';

export default function Caisse({
    catalogue,
    categories,
    customers,
    paymentMethods,
    allowNegativeStock,
}: {
    catalogue: CatalogueItem[];
    categories: IdOption[];
    customers: CustomerOption[];
    paymentMethods: Option[];
    allowNegativeStock: boolean;
}) {
    const { errors } = usePage<SharedProps>().props;

    const [search, setSearch] = useState('');
    const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);
    const [lines, setLines] = useState<CartLine[]>([]);
    const [customerId, setCustomerId] = useState<string>(NO_CUSTOMER);
    const [paymentMethod, setPaymentMethod] = useState(
        paymentMethods[0]?.value ?? 'especes',
    );
    const [globalDiscount, setGlobalDiscount] = useState(0);
    const [amountPaidRaw, setAmountPaidRaw] = useState('');
    const [note, setNote] = useState('');
    const [processing, setProcessing] = useState(false);
    const [cartOpen, setCartOpen] = useState(false);
    const [nouveauClient, setNouveauClient] = useState<{
        name: string;
        phone: string;
        email: string;
        city: string;
    } | null>(null);
    const [creating, setCreating] = useState(false);

    const scanRef = useRef<HTMLInputElement>(null);

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return catalogue
            .filter((item) => {
                if (
                    categoryId !== ALL_CATEGORIES &&
                    String(item.categoryId) !== categoryId
                ) {
                    return false;
                }

                if (needle.length === 0) {
                    return true;
                }

                return (
                    item.label.toLowerCase().includes(needle) ||
                    item.sku.toLowerCase().includes(needle) ||
                    (item.barcode ?? '').includes(needle)
                );
            })
            .slice(0, 60);
    }, [catalogue, search, categoryId]);

    const subtotal = lines.reduce(
        (sum, line) => sum + line.unitPrice * line.quantity - line.discount,
        0,
    );
    const total = Math.max(0, subtotal - globalDiscount);
    const amountPaid =
        amountPaidRaw === '' ? total : parseAmount(amountPaidRaw);
    const change = Math.max(0, amountPaid - total);
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

    function addToCart(item: CatalogueItem, quantity = 1) {
        setLines((current) => {
            const existing = current.find((line) => line.variantId === item.id);

            if (existing) {
                const nextQuantity = existing.quantity + quantity;

                if (!allowNegativeStock && nextQuantity > item.stock) {
                    toast.warning(
                        `Stock insuffisant : il reste ${item.stock} × ${item.label}.`,
                    );

                    return current;
                }

                return current.map((line) =>
                    line.variantId === item.id
                        ? { ...line, quantity: nextQuantity }
                        : line,
                );
            }

            if (!allowNegativeStock && item.stock < quantity) {
                toast.warning(`« ${item.label} » n'est plus en stock.`);

                return current;
            }

            return [
                ...current,
                {
                    variantId: item.id,
                    label: item.label,
                    sku: item.sku,
                    unitPrice: item.price,
                    quantity,
                    discount: 0,
                    stock: item.stock,
                },
            ];
        });
    }

    /** La douchette tape le code puis valide : on cherche une correspondance exacte. */
    function handleScan(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();

        const needle = search.trim();

        if (needle.length === 0) {
            return;
        }

        const exact = catalogue.find(
            (item) => item.barcode === needle || item.sku === needle,
        );

        if (exact) {
            addToCart(exact);
            setSearch('');

            return;
        }

        if (filtered.length === 1) {
            addToCart(filtered[0]);
            setSearch('');

            return;
        }

        if (filtered.length === 0) {
            toast.error(`Aucun article ne correspond à « ${needle} ».`);
        }
    }

    function updateLine(variantId: number, patch: Partial<CartLine>) {
        setLines((current) =>
            current.map((line) =>
                line.variantId === variantId ? { ...line, ...patch } : line,
            ),
        );
    }

    function changeQuantity(variantId: number, delta: number) {
        setLines((current) =>
            current.flatMap((line) => {
                if (line.variantId !== variantId) {
                    return [line];
                }

                const next = line.quantity + delta;

                if (next <= 0) {
                    return [];
                }

                if (!allowNegativeStock && next > line.stock) {
                    toast.warning(`Stock disponible : ${line.stock}.`);

                    return [line];
                }

                return [{ ...line, quantity: next }];
            }),
        );
    }

    /**
     * Crée le client et le rattache aussitôt à la vente en cours.
     *
     * Le panier n'est pas touché : c'est tout l'intérêt de le faire ici
     * plutôt que d'envoyer le vendeur sur l'écran « Clients ».
     */
    function createCustomer(event: React.FormEvent) {
        event.preventDefault();

        if (!nouveauClient) {
            return;
        }

        setCreating(true);

        router.post('/caisse/client', nouveauClient, {
            preserveScroll: true,
            preserveState: true,
            // Seule la liste des clients est rafraîchie ; le catalogue et le
            // panier restent tels quels.
            only: ['customers', 'nouveauClientId', 'errors'],
            onSuccess: (page) => {
                const cree = (page.props as { nouveauClientId?: number })
                    .nouveauClientId;

                if (cree) {
                    setCustomerId(String(cree));
                }

                setNouveauClient(null);
            },
            onFinish: () => setCreating(false),
        });
    }

    function resetCart() {
        setCartOpen(false);
        setLines([]);
        setGlobalDiscount(0);
        setAmountPaidRaw('');
        setNote('');
        setCustomerId(NO_CUSTOMER);
        scanRef.current?.focus();
    }

    function submit() {
        if (lines.length === 0) {
            toast.error('Le panier est vide.');

            return;
        }

        setProcessing(true);

        router.post(
            '/caisse/vente',
            {
                lines: lines.map((line) => ({
                    product_variant_id: line.variantId,
                    quantity: line.quantity,
                    unit_price: line.unitPrice,
                    discount: line.discount,
                })),
                customer_id:
                    customerId === NO_CUSTOMER ? null : Number(customerId),
                discount: globalDiscount,
                amount_paid: amountPaid,
                payment_method: paymentMethod,
                note: note || null,
            },
            {
                onFinish: () => setProcessing(false),
                onSuccess: () => resetCart(),
            },
        );
    }

    // Le panier est rendu une seule fois puis placé selon l'écran :
    // colonne à droite sur ordinateur, tiroir sur téléphone.
    const panier = (
                    <div className="flex h-fit flex-col bg-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:rounded-xl lg:border lg:shadow-sm">
                        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                            <h2 className="flex items-center gap-2 font-semibold">
                                <ShoppingCart className="size-4.5" />
                                Panier
                                {itemCount > 0 ? (
                                    // La clé change à chaque quantité : la pastille
                                    // se rejoue, l'ajout se voit du coin de l'œil.
                                    <span
                                        key={itemCount}
                                        className="anim-cellule rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white tabular-nums"
                                    >
                                        {itemCount}
                                    </span>
                                ) : null}
                            </h2>
                            {lines.length > 0 ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={resetCart}
                                    className="text-muted-foreground"
                                >
                                    <Trash2 className="size-4" />
                                    Vider
                                </Button>
                            ) : null}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {lines.length === 0 ? (
                                <EmptyState
                                    icon={ShoppingCart}
                                    title="Panier vide"
                                    description="Scannez un code-barres ou cliquez sur un article."
                                    className="py-10"
                                />
                            ) : (
                                <ul className="divide-y">
                                    {lines.map((line) => (
                                        <li
                                            key={line.variantId}
                                            className="anim-entree p-3"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">
                                                        {line.label}
                                                    </p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {line.sku}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setLines((current) =>
                                                            current.filter(
                                                                (l) =>
                                                                    l.variantId !==
                                                                    line.variantId,
                                                            ),
                                                        )
                                                    }
                                                    className="shrink-0 text-muted-foreground transition-[color,transform] duration-150 ease-out hover:scale-110 hover:text-destructive active:scale-90"
                                                    aria-label="Retirer l'article"
                                                >
                                                    <X className="size-4" />
                                                </button>
                                            </div>

                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="flex items-center rounded-md border">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            changeQuantity(
                                                                line.variantId,
                                                                -1,
                                                            )
                                                        }
                                                        className="flex size-7 items-center justify-center rounded-l-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-90"
                                                        aria-label="Retirer un"
                                                    >
                                                        <Minus className="size-3.5" />
                                                    </button>
                                                    <span className="w-8 text-center text-sm font-medium tabular-nums">
                                                        {line.quantity}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            changeQuantity(
                                                                line.variantId,
                                                                1,
                                                            )
                                                        }
                                                        className="flex size-7 items-center justify-center rounded-r-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-90"
                                                        aria-label="Ajouter un"
                                                    >
                                                        <Plus className="size-3.5" />
                                                    </button>
                                                </div>

                                                <Input
                                                    value={amount(line.unitPrice)}
                                                    onChange={(event) =>
                                                        updateLine(line.variantId, {
                                                            unitPrice: parseAmount(
                                                                event.target.value,
                                                            ),
                                                        })
                                                    }
                                                    className="h-7 w-24 text-right text-sm tabular-nums"
                                                    inputMode="numeric"
                                                    aria-label="Prix unitaire"
                                                />

                                                <span className="ml-auto text-sm font-semibold tabular-nums">
                                                    {amount(
                                                        line.unitPrice *
                                                            line.quantity -
                                                            line.discount,
                                                    )}
                                                </span>
                                            </div>

                                            {line.discount > 0 ? (
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Remise appliquée :{' '}
                                                    {money(line.discount)}
                                                </p>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="space-y-3 border-t p-4">
                            <div className="grid gap-2">
                                <span className="flex items-center justify-between gap-2">
                                    <Label
                                        htmlFor="client"
                                        className="text-xs text-muted-foreground"
                                    >
                                        Client (facultatif)
                                    </Label>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setNouveauClient({
                                                name: '',
                                                phone: '',
                                                email: '',
                                                city: '',
                                            })
                                        }
                                        className="flex items-center gap-1.5 text-xs font-medium text-blue-700 transition-opacity hover:opacity-70 dark:text-blue-400"
                                    >
                                        <UserPlus className="size-3.5" />
                                        Nouveau client
                                    </button>
                                </span>
                                <Select
                                    value={customerId}
                                    onValueChange={setCustomerId}
                                >
                                    <SelectTrigger id="client" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NO_CUSTOMER}>
                                            <span className="flex items-center gap-2">
                                                <UserRound className="size-3.5" />
                                                Client de passage
                                            </span>
                                        </SelectItem>
                                        {customers.map((customer) => (
                                            <SelectItem
                                                key={customer.id}
                                                value={String(customer.id)}
                                            >
                                                {customer.name}
                                                {customer.phone
                                                    ? ` — ${customer.phone}`
                                                    : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Sous-total</span>
                                    <span className="tabular-nums">
                                        {money(subtotal)}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between gap-2">
                                    <Label
                                        htmlFor="remise"
                                        className="font-normal text-muted-foreground"
                                    >
                                        Remise globale
                                    </Label>
                                    <Input
                                        id="remise"
                                        value={
                                            globalDiscount === 0
                                                ? ''
                                                : amount(globalDiscount)
                                        }
                                        onChange={(event) =>
                                            setGlobalDiscount(
                                                Math.min(
                                                    parseAmount(event.target.value),
                                                    subtotal,
                                                ),
                                            )
                                        }
                                        placeholder="0"
                                        inputMode="numeric"
                                        className="h-8 w-28 text-right tabular-nums"
                                    />
                                </div>

                                <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                                    <span>Total</span>
                                    <span className="tabular-nums">
                                        {money(total)}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="grid gap-1.5">
                                    <Label
                                        htmlFor="paiement"
                                        className="text-xs text-muted-foreground"
                                    >
                                        Paiement
                                    </Label>
                                    <Select
                                        value={paymentMethod}
                                        onValueChange={setPaymentMethod}
                                    >
                                        <SelectTrigger
                                            id="paiement"
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {paymentMethods.map((method) => (
                                                <SelectItem
                                                    key={method.value}
                                                    value={method.value}
                                                >
                                                    {method.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-1.5">
                                    <Label
                                        htmlFor="recu"
                                        className="text-xs text-muted-foreground"
                                    >
                                        Montant reçu
                                    </Label>
                                    <Input
                                        id="recu"
                                        value={amountPaidRaw}
                                        onChange={(event) =>
                                            setAmountPaidRaw(event.target.value)
                                        }
                                        placeholder={amount(total)}
                                        inputMode="numeric"
                                        className="text-right tabular-nums"
                                    />
                                </div>
                            </div>

                            {change > 0 ? (
                                <div className="flex justify-between rounded-md bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                    <span>Monnaie à rendre</span>
                                    <span className="tabular-nums">
                                        {money(change)}
                                    </span>
                                </div>
                            ) : null}

                            {amountPaid < total && amountPaidRaw !== '' ? (
                                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                    <span>
                                        Paiement partiel : il restera{' '}
                                        {money(total - amountPaid)} à encaisser.
                                    </span>
                                </div>
                            ) : null}

                            <Textarea
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="Note sur la vente (facultatif)"
                                className="min-h-0 resize-none text-sm"
                                rows={2}
                            />

                            {errors && Object.keys(errors).length > 0 ? (
                                <p className="text-xs text-destructive">
                                    {Object.values(errors)[0] as string}
                                </p>
                            ) : null}

                            <Button
                                type="button"
                                onClick={submit}
                                disabled={lines.length === 0 || processing}
                                className="h-11 w-full text-base"
                            >
                                {processing ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Encaisser {money(total)}
                            </Button>
                        </div>
                    </div>
    );

    return (
        <>
            <Head title="Caisse" />

            <div className="grid flex-1 gap-4 p-3 sm:p-4 lg:grid-cols-[1fr_400px]">
                {/* Catalogue */}
                <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-56 flex-1">
                            <Barcode className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                ref={scanRef}
                                autoFocus
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                onKeyDown={handleScan}
                                placeholder="Scanner un code-barres ou rechercher un article…"
                                className="h-11 pl-10 text-base"
                            />
                            {search ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearch('');
                                        scanRef.current?.focus();
                                    }}
                                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors duration-150 hover:text-foreground"
                                >
                                    <X className="size-4" />
                                </button>
                            ) : null}
                        </div>

                        <Select
                            value={categoryId}
                            onValueChange={setCategoryId}
                        >
                            <SelectTrigger className="h-11 w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL_CATEGORIES}>
                                    Toutes les catégories
                                </SelectItem>
                                {categories.map((category) => (
                                    <SelectItem
                                        key={category.id}
                                        value={String(category.id)}
                                    >
                                        {category.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {filtered.length === 0 ? (
                        <div className="rounded-xl border bg-card">
                            <EmptyState
                                icon={Barcode}
                                title="Aucun article"
                                description={
                                    search
                                        ? `Rien ne correspond à « ${search} ».`
                                        : 'Le catalogue est vide. Créez d’abord des produits.'
                                }
                            />
                        </div>
                    ) : (
                        <div className="grid auto-rows-min grid-cols-2 gap-2 xl:grid-cols-3">
                            {filtered.map((item) => {
                                const outOfStock = item.stock <= 0;

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => addToCart(item)}
                                        disabled={
                                            outOfStock && !allowNegativeStock
                                        }
                                        // Retour au clic : sur un écran tactile,
                                        // l'enfoncement est la seule preuve que
                                        // l'article a bien été pris.
                                        className={cn(
                                            'flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out',
                                            outOfStock && !allowNegativeStock
                                                ? 'cursor-not-allowed opacity-50'
                                                : 'hover:-translate-y-0.5 hover:border-blue-500/50 hover:bg-accent hover:shadow-md active:translate-y-0 active:scale-[0.97]',
                                        )}
                                    >
                                        <span className="line-clamp-2 text-sm leading-snug font-medium">
                                            {item.productName}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {item.variantLabel}
                                        </span>
                                        <span className="mt-auto flex w-full items-end justify-between gap-2 pt-1">
                                            <span className="text-sm font-semibold tabular-nums">
                                                {money(item.price)}
                                            </span>
                                            <span
                                                className={cn(
                                                    'text-xs tabular-nums',
                                                    outOfStock
                                                        ? 'text-red-600 dark:text-red-400'
                                                        : 'text-muted-foreground',
                                                )}
                                            >
                                                {outOfStock
                                                    ? 'Rupture'
                                                    : `${item.stock} en stock`}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Panier — colonne fixe à partir de l'ordinateur */}
                <div className="hidden lg:block">{panier}</div>
            </div>

            {/*
             * Téléphone et tablette : le panier tient dans un tiroir. Sur un
             * écran de 6 pouces, une colonne posée sous soixante articles
             * obligerait à faire défiler tout le catalogue pour encaisser.
             * La barre reste sous le pouce, le total toujours visible.
             */}
            {lines.length > 0 ? (
                <div className="sticky bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
                    <Button
                        type="button"
                        onClick={() => setCartOpen(true)}
                        className="h-12 w-full justify-between text-base"
                    >
                        <span className="flex items-center gap-2">
                            <ShoppingCart className="size-5" />
                            {itemCount} article{itemCount > 1 ? 's' : ''}
                        </span>
                        <span className="tabular-nums">{money(total)}</span>
                    </Button>
                </div>
            ) : null}

            {/* ------------------------------------ Nouveau client */}
            <Dialog
                open={nouveauClient !== null}
                onOpenChange={(ouvert) => !ouvert && setNouveauClient(null)}
            >
                <DialogContent>
                    <form onSubmit={createCustomer} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>Nouveau client</DialogTitle>
                            <DialogDescription>
                                Le nom suffit. La fiche se compl\u00e8tera plus tard,
                                depuis l\u2019\u00e9cran Clients.
                            </DialogDescription>
                        </DialogHeader>

                        {nouveauClient ? (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="nc-nom">Nom complet</Label>
                                    <Input
                                        id="nc-nom"
                                        autoFocus
                                        value={nouveauClient.name}
                                        onChange={(event) =>
                                            setNouveauClient({
                                                ...nouveauClient,
                                                name: event.target.value,
                                            })
                                        }
                                        className="h-11 text-base"
                                        required
                                    />
                                    {errors?.name ? (
                                        <p className="text-xs text-destructive">
                                            {errors.name as string}
                                        </p>
                                    ) : null}
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="nc-tel">
                                            T\u00e9l\u00e9phone
                                        </Label>
                                        <Input
                                            id="nc-tel"
                                            type="tel"
                                            inputMode="tel"
                                            value={nouveauClient.phone}
                                            onChange={(event) =>
                                                setNouveauClient({
                                                    ...nouveauClient,
                                                    phone: event.target.value,
                                                })
                                            }
                                            placeholder="77 000 00 00"
                                            className="h-11 text-base"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="nc-ville">Ville</Label>
                                        <Input
                                            id="nc-ville"
                                            value={nouveauClient.city}
                                            onChange={(event) =>
                                                setNouveauClient({
                                                    ...nouveauClient,
                                                    city: event.target.value,
                                                })
                                            }
                                            className="h-11 text-base"
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="nc-email">
                                        E-mail (facultatif)
                                    </Label>
                                    <Input
                                        id="nc-email"
                                        type="email"
                                        value={nouveauClient.email}
                                        onChange={(event) =>
                                            setNouveauClient({
                                                ...nouveauClient,
                                                email: event.target.value,
                                            })
                                        }
                                        className="h-11 text-base"
                                    />
                                </div>

                                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                                    Si ce num\u00e9ro existe d\u00e9j\u00e0, la fiche
                                    existante sera reprise au lieu d\u2019en cr\u00e9er
                                    une seconde.
                                </p>
                            </>
                        ) : null}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setNouveauClient(null)}
                            >
                                Annuler
                            </Button>
                            <Button type="submit" disabled={creating}>
                                {creating ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <UserPlus className="size-4" />
                                )}
                                Cr\u00e9er et rattacher
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
                <SheetContent
                    side="bottom"
                    className="max-h-[92svh] gap-0 overflow-y-auto p-0 lg:hidden"
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>Panier</SheetTitle>
                    </SheetHeader>
                    {panier}
                </SheetContent>
            </Sheet>
        </>
    );
}


Caisse.layout = {
    breadcrumbs: [{ title: 'Caisse', href: '/caisse' }],
};
