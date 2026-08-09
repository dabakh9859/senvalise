import { Link, usePage } from '@inertiajs/react';
import {
    BarChart3,
    CopyCheck,
    FileText,
    Home,
    Inbox,
    MessageSquare,
    Package,
    PackageCheck,
    PiggyBank,
    QrCode,
    Receipt,
    Settings2,
    ShoppingCart,
    Truck,
    Users,
    Warehouse,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarSeparator,
} from '@/components/ui/sidebar';
import type { NavItem, SharedProps } from '@/types';

export function AppSidebar() {
    const { auth, alerts } = usePage<SharedProps>().props;
    const isGerant = auth?.isGerant ?? false;

    /* Le quotidien : vendre, facturer, parler aux clients. */
    const quotidien: NavItem[] = [
        { title: 'Accueil', href: '/dashboard', icon: Home },
        { title: 'Caisse', href: '/caisse', icon: ShoppingCart },
        { title: 'Ventes', href: '/ventes', icon: Receipt },
        { title: 'Factures & devis', href: '/documents', icon: FileText },
        ...(isGerant
            ? [
                  {
                      title: 'Messages',
                      href: '/messages',
                      icon: MessageSquare,
                  } satisfies NavItem,
              ]
            : []),
        { title: 'Clients', href: '/clients', icon: Users },
    ];

    /*
     * La boutique en ligne.
     *
     * Commandes et coffres sont ouverts au vendeur : c'est lui qui prépare les
     * colis et qui encaisse les versements au comptoir.
     */
    const enLigne: NavItem[] = [
        { title: 'Commandes', href: '/commandes', icon: PackageCheck },
        { title: 'Coffres', href: '/coffres', icon: PiggyBank },
        ...(isGerant
            ? [
                  {
                      title: 'Messages reçus',
                      href: '/contacts',
                      icon: Inbox,
                  } satisfies NavItem,
              ]
            : []),
    ];

    /* La marchandise. */
    const catalogue: NavItem[] = [
        { title: 'Produits', href: '/produits', icon: Package },
        {
            title: 'Stock',
            href: '/stock',
            icon: Warehouse,
            badge: alerts?.lowStock ?? 0,
        },
        { title: 'Étiquettes', href: '/etiquettes', icon: QrCode },
        ...(isGerant
            ? [
                  {
                      title: 'Arrivages',
                      href: '/arrivages',
                      icon: Truck,
                  } satisfies NavItem,
              ]
            : []),
    ];

    /* Le pilotage. */
    const pilotage: NavItem[] = isGerant
        ? [
              { title: 'Rapports', href: '/rapports', icon: BarChart3 },
              { title: 'Doublons', href: '/doublons', icon: CopyCheck },
              {
                  title: 'Réglages',
                  href: '/reglages/boutique',
                  icon: Settings2,
              },
          ]
        : [];

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/dashboard" prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={quotidien} />
                <SidebarSeparator className="mx-2" />
                <NavMain items={enLigne} label="Boutique en ligne" />
                <SidebarSeparator className="mx-2" />
                <NavMain items={catalogue} />
                {pilotage.length > 0 ? (
                    <>
                        <SidebarSeparator className="mx-2" />
                        <NavMain items={pilotage} />
                    </>
                ) : null}
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
