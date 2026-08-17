import inertia from '@inertiajs/vite';
import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        /*
         * Écoute sur toutes les interfaces pour que le port publié par Docker
         * soit joignable, mais annonce `localhost` au client HMR : c'est
         * l'adresse écrite dans `public/hot` et donc celle que le navigateur
         * de l'hôte doit appeler. Sans Docker, le comportement est identique.
         */
        host: '0.0.0.0',
        port: 5173,
        hmr: { host: 'localhost' },
        /*
         * Sur un montage de volume sans propagation d'événements inotify
         * (Docker Desktop macOS/Windows), lancer avec VITE_POLL=1.
         */
        watch: process.env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined,
    },
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            refresh: true,
            /*
             * Les polices sont téléchargées à la construction et servies
             * depuis notre domaine : aucune requête vers un tiers au
             * chargement, ce qui compte sur une connexion mobile sénégalaise.
             */
            /*
             * Deux familles, une par registre.
             *
             * Instrument Sans porte toute l'application de gestion et le corps
             * de texte de la vitrine : c'est la police de travail, lisible à
             * petit corps et à toutes les graisses.
             *
             * Instrument Serif ne sert qu'aux titres d'affiche de la vitrine.
             * C'est ce qui sépare enfin les deux registres annoncés — la
             * boutique a trois secondes pour accrocher, un serif à fort
             * contraste y fait un travail qu'aucune graisse de linéale ne
             * fait. Une seule graisse (400) et son italique : à ce corps-là,
             * le dessin de la lettre suffit, et ça tient en ~30 ko.
             *
             * Les deux sont de la même fonderie et partagent leurs
             * proportions, elles se répondent sans jurer.
             */
            fonts: [
                bunny('Instrument Sans', {
                    weights: [400, 500, 600, 700],
                }),
                bunny('Instrument Serif', {
                    weights: [400],
                    styles: ['normal', 'italic'],
                }),
            ],
        }),
        inertia(),
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
        wayfinder({
            formVariants: true,
        }),
    ],
});
