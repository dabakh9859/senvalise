/** Types partagés par les écrans de gestion. */

export type PaginationLink = {
    url: string | null;
    label: string;
    active: boolean;
};

export type Paginated<T> = {
    data: T[];
    links: PaginationLink[];
    current_page: number;
    last_page: number;
    per_page: number;
    from: number | null;
    to: number | null;
    total: number;
};

export type Option = {
    value: string;
    label: string;
};

export type IdOption = {
    id: number;
    name: string;
};

/** Article vendable : c'est lui qui porte le code-barres, le stock et le prix. */
export type VariantOption = {
    id: number;
    label: string;
    sku: string;
    barcode: string | null;
    price?: number;
    sellingPrice?: number;
    costPrice?: number;
    stock: number;
};

export type ShopInfo = {
    name: string;
    /** Logo déposé dans les réglages ; null tant qu'il n'y en a pas. */
    logo: string | null;
    phone: string | null;
    address: string | null;
    currency: string;
};

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
