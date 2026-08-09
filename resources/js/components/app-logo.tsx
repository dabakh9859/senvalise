import { usePage } from '@inertiajs/react';

import AppLogoIcon from '@/components/app-logo-icon';
import type { SharedProps } from '@/types';

export default function AppLogo() {
    const { shop } = usePage<SharedProps>().props;

    return (
        <>
            {/* Le vrai logo s'il a été déposé, l'écusson dessiné sinon. */}
            {shop?.logo ? (
                <img
                    src={shop.logo}
                    alt=""
                    className="size-8 shrink-0 object-contain"
                />
            ) : (
                <AppLogoIcon className="size-8 shrink-0" />
            )}
            <div className="ml-1 grid flex-1 text-left text-sm">
                <span className="truncate leading-tight font-semibold">
                    {shop?.name ?? 'SenValise'}
                </span>
                <span className="truncate text-[11px] leading-tight text-muted-foreground">
                    Gestion de stock
                </span>
            </div>
        </>
    );
}
