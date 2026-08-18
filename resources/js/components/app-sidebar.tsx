import { Link, usePage } from '@inertiajs/react';
import {
    ArrowLeftRight,
    Banknote,
    BarChart3,
    ClipboardList,
    CopyCheck,
    Home,
    Inbox,
    MessageSquare,
    Package,
    PackageCheck,
    PiggyBank,
    QrCode,
    Receipt,
    RotateCcw,
    Settings2,
    ShoppingCart,
    Store,
    Truck,
    Users,
    Wallet,
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

    /*
     * La barre suit le déroulé d'une journée plutôt que l'organigramme :
     * on vend, on tient la caisse, on regarde la marchandise, puis seulement
     * on pilote. Chaque groupe porte son intitulé — sans étiquette, douze
     * entrées d'affilée se lisent comme une liste de courses.
     */
    const accueil: NavItem[] = [
        { title: 'Accueil', href: '/dashboard', icon: Home },
    ];

    /* Le comptoir : tout ce qui se passe face à un client. */
    const comptoir: NavItem[] = [
        { title: 'Ventes & factures', href: '/documents', icon: ShoppingCart },
        { title: 'Historique', href: '/ventes', icon: Receipt },
        { title: 'Retours', href: '/retours', icon: RotateCcw },
        { title: 'Clients', href: '/clients', icon: Users },
    ];

    /* L'argent du jour. */
    const argent: NavItem[] = [
        { title: 'Caisse', href: '/caisse', icon: Wallet },
        { title: 'Achats du jour', href: '/achats', icon: Banknote },
    ];

    /*
     * La marchandise.
     *
     * « Produits & stock » est un seul écran : le catalogue porte les
     * quantités. Les mouvements et l'inventaire restent à part, ce sont des
     * journaux, pas des listes de produits.
     */
    const marchandise: NavItem[] = [
        {
            title: 'Produits & stock',
            href: '/produits',
            icon: Package,
            badge: alerts?.lowStock ?? 0,
        },
        {
            title: 'Mouvements',
            href: '/stock/mouvements',
            icon: ArrowLeftRight,
        },
        ...(isGerant
            ? [
                  {
                      title: 'Inventaire',
                      href: '/stock/inventaire',
                      icon: ClipboardList,
                  } satisfies NavItem,
                  {
                      title: 'Arrivages',
                      href: '/arrivages',
                      icon: Truck,
                  } satisfies NavItem,
              ]
            : []),
        { title: 'Étiquettes', href: '/etiquettes', icon: QrCode },
    ];

    /*
     * La boutique en ligne, réservée au gérant.
     *
     * Une commande avancée à tort ou un versement de coffre encaissé de
     * travers engage l'argent du client sur des mois : cela se rattrape mal.
     * Le vendeur tient le comptoir, le gérant tient la boutique en ligne.
     */
    const enLigne: NavItem[] = isGerant
        ? [
              { title: 'Voir la boutique', href: '/boutique', icon: Store },
              { title: 'Commandes', href: '/commandes', icon: PackageCheck },
              { title: 'Coffres', href: '/coffres', icon: PiggyBank },
              { title: 'Messages reçus', href: '/contacts', icon: Inbox },
          ]
        : [];

    /* Le pilotage. */
    const pilotage: NavItem[] = isGerant
        ? [
              { title: 'Rapports', href: '/rapports', icon: BarChart3 },
              { title: 'Messages', href: '/messages', icon: MessageSquare },
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
                <NavMain items={accueil} />
                <SidebarSeparator className="mx-2" />
                <NavMain items={comptoir} label="Comptoir" />
                <SidebarSeparator className="mx-2" />
                <NavMain items={argent} label="Caisse" />
                <SidebarSeparator className="mx-2" />
                <NavMain items={marchandise} label="Marchandise" />
                {enLigne.length > 0 ? (
                    <>
                        <SidebarSeparator className="mx-2" />
                        <NavMain items={enLigne} label="Boutique en ligne" />
                    </>
                ) : null}
                {pilotage.length > 0 ? (
                    <>
                        <SidebarSeparator className="mx-2" />
                        <NavMain items={pilotage} label="Pilotage" />
                    </>
                ) : null}
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
