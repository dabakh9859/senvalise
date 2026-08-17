import {
    Check,
    Loader2,
    MapPin,
    MapPinOff,
    RotateCcw,
    TriangleAlert,
} from 'lucide-react';
import { precisionLisible, useGeolocation } from '@/hooks/use-geolocation';
import type { Position } from '@/hooks/use-geolocation';

/**
 * Le partage de position, avec son consentement.
 *
 * Trois principes, dans cet ordre :
 *
 * 1. **On explique avant de demander.** La fenêtre du navigateur ne dit que
 *    « ce site veut connaître votre position » — à nous de dire pourquoi, et
 *    ce qu'on en fera. Une fois refusée, elle ne se rouvre plus.
 * 2. **C'est facultatif.** Aucun bouton n'est bloqué, aucune commande n'est
 *    empêchée. Le client qui refuse commande exactement comme avant.
 * 3. **C'est réversible.** Le point partagé peut être retiré d'un clic, ici
 *    même, avant l'envoi.
 */
export function PositionLivraison({
    position,
    onChange,
    onZoneSuggeree,
}: {
    position: Position | null;
    onChange: (position: Position | null) => void;
    /** Appelé avec la zone que la position suggère, s'il y en a une. */
    onZoneSuggeree?: (zone: {
        id: number;
        name: string;
        fee: number;
        covers: boolean;
        distanceKm: number;
    }) => void;
}) {
    // La position remonte par rappel, au moment où le navigateur la donne :
    // on enregistre, puis on demande au serveur quelle zone elle désigne.
    const { etat, disponible, demander, reinitialiser } = useGeolocation(
        (obtenue) => {
            onChange(obtenue);

            if (onZoneSuggeree) {
                void suggererZone(obtenue).then((zone) => {
                    if (zone) {
                        onZoneSuggeree(zone);
                    }
                });
            }
        },
    );

    if (!disponible) {
        return null;
    }

    return (
        <div className="space-y-3 border border-dashed p-4">
            <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--vitrine-terre)]" />
                <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">
                        Aider le livreur à vous trouver
                    </p>
                    <p className="text-xs text-[var(--vitrine-encre)]/60">
                        Au Sénégal, une adresse écrite mène au quartier, pas à
                        la porte. En partageant votre position, le livreur
                        arrive directement chez vous.{' '}
                        <strong className="font-medium">
                            C’est facultatif
                        </strong>{' '}
                        : votre position ne sert qu’à cette livraison et n’est
                        transmise à personne d’autre.
                    </p>
                </div>
            </div>

            {position ? (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-500/10 px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-emerald-700">
                        <Check className="size-3.5 shrink-0" />
                        Position enregistrée
                        {position.accuracy !== null
                            ? ` — ${precisionLisible(position.accuracy)}`
                            : ''}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            onChange(null);
                            reinitialiser();
                        }}
                        className="flex items-center gap-1.5 text-xs text-[var(--vitrine-encre)]/60 underline underline-offset-4 transition-opacity hover:opacity-70"
                    >
                        <MapPinOff className="size-3" />
                        Retirer
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={demander}
                    disabled={etat === 'en-cours'}
                    className="flex w-full items-center justify-center gap-2 border border-[var(--vitrine-trait)] px-5 py-2.5 text-sm font-medium transition-[border-color,transform] duration-150 hover:border-[var(--vitrine-encre)] active:scale-[0.98] disabled:opacity-60 sm:w-auto"
                >
                    {etat === 'en-cours' ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <MapPin className="size-4" />
                    )}
                    {etat === 'en-cours'
                        ? 'Recherche en cours…'
                        : 'Partager ma position'}
                </button>
            )}

            {/*
             * Un refus se respecte, mais il faut dire comment revenir dessus :
             * le navigateur ne redemandera plus rien de lui-même.
             */}
            {etat === 'refusee' ? (
                <p className="flex items-start gap-2 bg-[var(--vitrine-alerte)]/10 px-3 py-2 text-xs text-[var(--vitrine-alerte)]">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                        Position refusée — aucun problème, votre commande passe
                        quand même. Pour changer d’avis, autorisez la
                        localisation dans les réglages de votre navigateur, puis
                        rechargez la page.
                    </span>
                </p>
            ) : null}

            {etat === 'echec' ? (
                <p className="flex items-center justify-between gap-3 bg-[var(--vitrine-alerte)]/10 px-3 py-2 text-xs text-[var(--vitrine-alerte)]">
                    <span className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                        Position introuvable. Vérifiez que le GPS est activé.
                    </span>
                    <button
                        type="button"
                        onClick={demander}
                        className="flex shrink-0 items-center gap-1.5 underline underline-offset-4"
                    >
                        <RotateCcw className="size-3" />
                        Réessayer
                    </button>
                </p>
            ) : null}
        </div>
    );
}

/**
 * Demande au serveur quelle zone correspond à une position.
 *
 * Le calcul se fait chez nous, pas chez un service de cartographie : envoyer
 * la position d'un client à un tiers qu'il n'a pas choisi serait exactement
 * ce qu'on lui a promis de ne pas faire.
 */
async function suggererZone(position: Position) {
    try {
        // Laravel reconnaît l'en-tête X-XSRF-TOKEN issu de son propre cookie :
        // pas besoin d'ajouter une balise meta au gabarit.
        const jeton = document.cookie
            .split('; ')
            .find((morceau) => morceau.startsWith('XSRF-TOKEN='))
            ?.split('=')[1];

        const reponse = await fetch('/boutique/commande/zone-proche', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(jeton ? { 'X-XSRF-TOKEN': decodeURIComponent(jeton) } : {}),
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                latitude: position.latitude,
                longitude: position.longitude,
            }),
        });

        if (!reponse.ok) {
            return null;
        }

        const donnees = await reponse.json();

        return donnees.zone ?? null;
    } catch {
        // Sans conséquence : le client choisit sa zone lui-même, comme avant.
        return null;
    }
}
