import { useCallback, useState } from 'react';

export type Position = {
    latitude: number;
    longitude: number;
    accuracy: number | null;
};

type Etat = 'inactif' | 'en-cours' | 'obtenue' | 'refusee' | 'echec';

/**
 * Demande la position du client.
 *
 * Rien ne part sans un geste de sa part : le navigateur n'affiche sa demande
 * d'autorisation qu'après un clic, et c'est très bien ainsi. Notre rôle est
 * d'expliquer *pourquoi* avant que cette fenêtre n'apparaisse — une fois
 * refusée, elle ne se rouvre pas, et le client doit alors aller la rétablir
 * dans les réglages de son navigateur.
 *
 * Les états sont distingués parce qu'ils appellent des réponses différentes :
 * un refus se respecte en silence, une panne de GPS se retente.
 */
export function useGeolocation(onSuccess?: (position: Position) => void) {
    const [etat, setEtat] = useState<Etat>('inactif');

    const disponible =
        typeof navigator !== 'undefined' && 'geolocation' in navigator;

    const demander = useCallback(() => {
        if (!disponible) {
            setEtat('echec');

            return;
        }

        setEtat('en-cours');

        navigator.geolocation.getCurrentPosition(
            (resultat) => {
                setEtat('obtenue');

                // Le résultat remonte par rappel plutôt que par état : le
                // parent le reçoit au moment où il arrive, sans qu'on ait à
                // le guetter depuis un effet.
                onSuccess?.({
                    latitude: resultat.coords.latitude,
                    longitude: resultat.coords.longitude,
                    accuracy: Number.isFinite(resultat.coords.accuracy)
                        ? Math.round(resultat.coords.accuracy)
                        : null,
                });
            },
            (erreur) => {
                setEtat(
                    erreur.code === erreur.PERMISSION_DENIED
                        ? 'refusee'
                        : 'echec',
                );
            },
            {
                // Le GPS du téléphone plutôt que l'adresse réseau : à Dakar,
                // la géolocalisation par IP se trompe de plusieurs kilomètres,
                // ce qui est pire que rien pour un livreur.
                enableHighAccuracy: true,
                // Au-delà, on renonce : mieux vaut laisser le client saisir
                // son adresse que le faire attendre devant un écran figé.
                timeout: 15000,
                // Une position d'il y a moins de deux minutes fait l'affaire.
                maximumAge: 120000,
            },
        );
    }, [disponible, onSuccess]);

    const reinitialiser = useCallback(() => setEtat('inactif'), []);

    return { etat, disponible, demander, reinitialiser };
}

/** « à 12 m près » / « à 1,2 km près » */
export function precisionLisible(metres: number | null): string | null {
    if (metres === null) {
        return null;
    }

    if (metres < 1000) {
        return `à ${metres} m près`;
    }

    return `à ${(metres / 1000).toFixed(1).replace('.', ',')} km près`;
}
