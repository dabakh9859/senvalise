import { Head, router } from '@inertiajs/react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { count, money, parseAmount } from '@/lib/format';

type Zone = {
    id: number;
    name: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    radiusKm: number | null;
    isMapped: boolean;
    fee: number;
    delayDays: number;
    note: string | null;
    position: number;
    isActive: boolean;
    ordersCount: number;
};

type FormState = {
    id?: number;
    name: string;
    city: string;
    latitude: string;
    longitude: string;
    radius_km: string;
    fee: string;
    delay_days: string;
    note: string;
    position: string;
    is_active: boolean;
};

function blank(): FormState {
    return {
        name: '',
        city: '',
        latitude: '',
        longitude: '',
        radius_km: '',
        fee: '0',
        delay_days: '1',
        note: '',
        position: '0',
        is_active: true,
    };
}

export default function Livraison({ zones }: { zones: Zone[] }) {
    const [editing, setEditing] = useState<FormState | null>(null);
    const [deleting, setDeleting] = useState<Zone | null>(null);

    function submit(event: React.FormEvent) {
        event.preventDefault();

        if (!editing) {
            return;
        }

        const payload = {
            ...editing,
            fee: parseAmount(editing.fee),
            delay_days: Number(editing.delay_days) || 0,
            position: Number(editing.position) || 0,
            // Vides plutot que zero : (0, 0) tombe dans le golfe de Guinee,
            // ce qui rendrait la zone « proche » de nulle part.
            latitude: editing.latitude ? Number(editing.latitude) : null,
            longitude: editing.longitude ? Number(editing.longitude) : null,
            radius_km: editing.radius_km ? Number(editing.radius_km) : null,
        };

        const options = {
            preserveScroll: true,
            onSuccess: () => setEditing(null),
        };

        if (editing.id) {
            router.put(`/reglages/livraison/${editing.id}`, payload, options);
        } else {
            router.post('/reglages/livraison', payload, options);
        }
    }

    return (
        <>
            <Head title="Zones de livraison" />

            <div className="space-y-4">
                <PageHeader
                    title="Zones de livraison"
                    description="Le client choisit sa zone, le montant s'ajuste devant lui."
                    actions={
                        <Button onClick={() => setEditing(blank())}>
                            <Plus className="size-4" />
                            Nouvelle zone
                        </Button>
                    }
                />

                {zones.length === 0 ? (
                    <div className="rounded-xl border bg-card">
                        <EmptyState
                            icon={MapPin}
                            title="Aucune zone"
                            description="Sans zone de livraison, personne ne peut commander en ligne."
                            action={
                                <Button
                                    size="sm"
                                    onClick={() => setEditing(blank())}
                                >
                                    <Plus className="size-4" />
                                    Créer la première zone
                                </Button>
                            }
                        />
                    </div>
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {zones.map((zone, index) => (
                            <li
                                key={zone.id}
                                style={{ animationDelay: `${index * 40}ms` }}
                                className="anim-entree space-y-2 rounded-xl border bg-card p-4"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">
                                            {zone.name}
                                        </p>
                                        {zone.city ? (
                                            <p className="truncate text-xs text-muted-foreground">
                                                {zone.city}
                                            </p>
                                        ) : null}
                                    </div>
                                    {zone.isActive ? null : (
                                        <StatusBadge
                                            label="Inactive"
                                            tone="neutral"
                                        />
                                    )}
                                </div>

                                <p className="text-lg font-semibold tabular-nums">
                                    {zone.fee === 0
                                        ? 'Livraison offerte'
                                        : money(zone.fee)}
                                </p>

                                <p className="text-xs text-muted-foreground">
                                    {zone.delayDays <= 1
                                        ? 'Sous 24 h'
                                        : `Sous ${zone.delayDays} jours`}
                                    {' · '}
                                    {count(zone.ordersCount)} commande
                                    {zone.ordersCount > 1 ? 's' : ''}
                                </p>

                                {/* Sans centre, la zone ne peut pas etre
                                    proposee automatiquement au client qui
                                    partage sa position. */}
                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <MapPin className="size-3 shrink-0" />
                                    {zone.isMapped
                                        ? `Plac\u00e9e sur la carte${zone.radiusKm ? ` \u00b7 rayon ${zone.radiusKm} km` : ''}`
                                        : 'Pas de centre \u2014 suggestion automatique impossible'}
                                </p>

                                {zone.note ? (
                                    <p className="text-xs text-muted-foreground">
                                        {zone.note}
                                    </p>
                                ) : null}

                                <div className="flex justify-end gap-1 border-t pt-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                            setEditing({
                                                id: zone.id,
                                                name: zone.name,
                                                city: zone.city ?? '',
                                                fee: String(zone.fee),
                                                delay_days: String(
                                                    zone.delayDays,
                                                ),
                                                note: zone.note ?? '',
                                                position: String(zone.position),
                                                is_active: zone.isActive,
                                                latitude:
                                                    zone.latitude?.toString() ??
                                                    '',
                                                longitude:
                                                    zone.longitude?.toString() ??
                                                    '',
                                                radius_km:
                                                    zone.radiusKm?.toString() ??
                                                    '',
                                            })
                                        }
                                        aria-label="Modifier"
                                    >
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setDeleting(zone)}
                                        className="text-muted-foreground hover:text-destructive"
                                        aria-label="Supprimer"
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <Dialog
                open={editing !== null}
                onOpenChange={(open) => !open && setEditing(null)}
            >
                <DialogContent>
                    <form onSubmit={submit} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>
                                {editing?.id ? 'Modifier la zone' : 'Nouvelle zone'}
                            </DialogTitle>
                        </DialogHeader>

                        {editing ? (
                            <>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="name">Nom</Label>
                                        <Input
                                            id="name"
                                            value={editing.name}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    name: event.target.value,
                                                })
                                            }
                                            placeholder="Dakar centre"
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="city">Ville</Label>
                                        <Input
                                            id="city"
                                            value={editing.city}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    city: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="grid gap-2">
                                        <Label htmlFor="fee">Frais (FCFA)</Label>
                                        <Input
                                            id="fee"
                                            inputMode="numeric"
                                            value={editing.fee}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    fee: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="delay">Délai (jours)</Label>
                                        <Input
                                            id="delay"
                                            inputMode="numeric"
                                            value={editing.delay_days}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    delay_days:
                                                        event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="position">Ordre</Label>
                                        <Input
                                            id="position"
                                            inputMode="numeric"
                                            value={editing.position}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    position: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                </div>

                                {/*
                                 * Le centre et le rayon servent à proposer
                                 * automatiquement cette zone au client qui
                                 * accepte d'être localisé. Facultatifs : sans
                                 * eux, la zone reste choisissable à la main.
                                 */}
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="grid gap-2">
                                        <Label htmlFor="lat">Latitude</Label>
                                        <Input
                                            id="lat"
                                            inputMode="decimal"
                                            value={editing.latitude}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    latitude: event.target.value,
                                                })
                                            }
                                            placeholder="14.6928"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="lng">Longitude</Label>
                                        <Input
                                            id="lng"
                                            inputMode="decimal"
                                            value={editing.longitude}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    longitude:
                                                        event.target.value,
                                                })
                                            }
                                            placeholder="-17.4467"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="radius">
                                            Rayon (km)
                                        </Label>
                                        <Input
                                            id="radius"
                                            inputMode="numeric"
                                            value={editing.radius_km}
                                            onChange={(event) =>
                                                setEditing({
                                                    ...editing,
                                                    radius_km:
                                                        event.target.value,
                                                })
                                            }
                                            placeholder="8"
                                        />
                                    </div>
                                </div>

                                <p className="bg-muted px-3 py-2 text-xs text-muted-foreground">
                                    Centre et rayon facultatifs. Renseignés, ils
                                    permettent de proposer automatiquement cette
                                    zone au client qui partage sa position.
                                    Relevez les coordonnées sur
                                    openstreetmap.org (clic droit → afficher
                                    l’adresse).
                                </p>

                                <div className="grid gap-2">
                                    <Label htmlFor="note">
                                        Précision affichée au client
                                    </Label>
                                    <Input
                                        id="note"
                                        value={editing.note}
                                        onChange={(event) =>
                                            setEditing({
                                                ...editing,
                                                note: event.target.value,
                                            })
                                        }
                                        placeholder="Livraison le matin uniquement"
                                    />
                                </div>

                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={editing.is_active}
                                        onCheckedChange={(checked) =>
                                            setEditing({
                                                ...editing,
                                                is_active: checked === true,
                                            })
                                        }
                                    />
                                    Zone proposée aux clients
                                </label>
                            </>
                        ) : null}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditing(null)}
                            >
                                Annuler
                            </Button>
                            <Button type="submit">Enregistrer</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer « {deleting?.name} » ?</DialogTitle>
                        <DialogDescription>
                            {deleting && deleting.ordersCount > 0
                                ? 'Des commandes y sont rattachées : la zone sera désactivée plutôt que supprimée.'
                                : 'Cette zone ne sera plus proposée aux clients.'}
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleting(null)}
                        >
                            Annuler
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (deleting) {
                                    router.delete(
                                        `/reglages/livraison/${deleting.id}`,
                                        {
                                            preserveScroll: true,
                                            onFinish: () => setDeleting(null),
                                        },
                                    );
                                }
                            }}
                        >
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
