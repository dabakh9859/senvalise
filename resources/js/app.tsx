import { createInertiaApp } from '@inertiajs/react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';
import BoutiqueLayout from '@/layouts/boutique-layout';
import ReglagesLayout from '@/layouts/reglages-layout';
import SettingsLayout from '@/layouts/settings/layout';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            // La boutique en ligne a sa propre enveloppe : ni barre latérale
            // ni fil d'Ariane — un acheteur n'est pas un utilisateur du
            // logiciel de gestion.
            case name.startsWith('boutique/'):
                return BoutiqueLayout;
            case name.startsWith('auth/'):
                return AuthLayout;
            case name.startsWith('settings/'):
                return [AppLayout, SettingsLayout];
            case name.startsWith('reglages/'):
                return [AppLayout, ReglagesLayout];
            default:
                return AppLayout;
        }
    },
    strictMode: true,
    withApp(app) {
        return (
            <TooltipProvider delayDuration={0}>
                {app}
                <Toaster />
            </TooltipProvider>
        );
    },
    // Barre de chargement aux couleurs de la boutique. Le délai évite de la
    // faire clignoter sur les navigations instantanées (pages préchargées).
    progress: {
        color: '#2a78d6',
        delay: 200,
        showSpinner: false,
    },
});

// This will set light / dark mode on load...
initializeTheme();
