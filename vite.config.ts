import inertia from '@inertiajs/vite';
import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import { defineConfig } from 'vite';

export default defineConfig({
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
             * Une seule famille sur tout le site, gestion et vitrine
             * confondues. Le contraste entre un titre et un micro-libellé se
             * fait à la graisse, au corps et à l'interlettrage — pas en
             * changeant de police. Deux familles de plus, c'était 150 ko de
             * téléchargement pour un écart que personne n'avait demandé.
             *
             * La graisse 700 est chargée pour les grands titres de la vitrine.
             */
            fonts: [
                bunny('Instrument Sans', {
                    weights: [400, 500, 600, 700],
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
