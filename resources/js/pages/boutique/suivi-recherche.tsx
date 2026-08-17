import { Head } from '@inertiajs/react';
import { PackageSearch } from 'lucide-react';
import { RechercheSuivi } from '@/pages/boutique/suivi';

export default function SuiviRecherche() {
    return (
        <>
            <Head title="Suivre ma commande" />

            <div className="mx-auto max-w-md px-4 py-12">
                <div className="anim-entree verre space-y-5 p-6">
                    <div className="space-y-2 text-center">
                        <span className="mx-auto flex size-11 items-center justify-center bg-[var(--vitrine-sable)] text-[var(--vitrine-encre)]/60">
                            <PackageSearch className="size-5" />
                        </span>
                        <h1 className="text-xl font-semibold tracking-tight">
                            Suivre ma commande
                        </h1>
                        <p className="text-sm text-[var(--vitrine-encre)]/60">
                            Votre numéro de commande et le téléphone donné à
                            l’achat suffisent — pas besoin de compte.
                        </p>
                    </div>

                    <RechercheSuivi />
                </div>
            </div>
        </>
    );
}
