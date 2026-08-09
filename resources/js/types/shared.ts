import type { User } from './auth';
import type { ShopInfo } from './senvalise';

/** Données partagées par le middleware Inertia sur toutes les pages. */
export type SharedProps = {
    name: string;
    auth: {
        user: User | null;
        isGerant: boolean;
        roleLabel: string | null;
    };
    shop: ShopInfo;
    alerts: {
        lowStock: number;
    };
    sidebarOpen: boolean;
    [key: string]: unknown;
};
