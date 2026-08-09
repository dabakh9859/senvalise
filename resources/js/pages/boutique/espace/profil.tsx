import { Head, router } from '@inertiajs/react';
import { ExternalLink, Loader2, MapPin, MapPinOff, Save } from 'lucide-react';
import { useState } from 'react';
import { EspaceNav } from '@/components/boutique/espace-nav';
import { PositionLivraison } from '@/components/boutique/position-livraison';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Position } from '@/hooks/use-geolocation';

export default function EspaceProfil({
    customer,
}: {
    customer: {
        name: string;
        phone: string | null;
        email: string | null;
        address: string | null;
        city: string | null;
        whatsappOptIn: boolean;
        latitude: number | null;
        longitude: number | null;
        locationAccuracy: number | null;
        accuracyLabel: string | null;
        locatedAt: string | null;
        hasLocation: boolean;
        mapUrl: string | null;
    };
}) {
    const [form, setForm] = useState({
        name: customer.name,
        phone: customer.phone ?? '',
        email: customer.email ?? '',
        address: customer.address ?? '',
        city: customer.city ?? '',
        whatsapp_opt_in: customer.whatsappOptIn,
        password: '',
        password_confirmation: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [position, setPosition] = useState<Position | null>(
        customer.latitude != null && customer.longitude != null
            ? {
                  latitude: customer.latitude,
                  longitude: customer.longitude,
                  accuracy: customer.locationAccuracy,
              }
            : null,
    );

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);

        router.put(
            '/boutique/espace/profil',
            {
                ...form,
                latitude: position?.latitude ?? null,
                longitude: position?.longitude ?? null,
                location_accuracy: position?.accuracy ?? null,
            },
            {
                preserveScroll: true,
                onError: setErrors,
                onSuccess: () =>
                    setForm((current) => ({
                        ...current,
                        password: '',
                        password_confirmation: '',
                    })),
                onFinish: () => setSaving(false),
            },
        );
    }

    return (
        <>
            <Head title="Mes informations" />

            <div className="mx-auto max-w-2xl px-4 py-8">
                <h1 className="mb-6 text-2xl font-semibold tracking-tight">
                    Mes informations
                </h1>

                <EspaceNav />

                <form onSubmit={submit} className="verre space-y-5 p-4 sm:p-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Champ
                            id="name"
                            label="Nom complet"
                            value={form.name}
                            onChange={(value) =>
                                setForm({ ...form, name: value })
                            }
                            error={errors.name}
                            required
                        />
                        <Champ
                            id="phone"
                            label="Téléphone"
                            type="tel"
                            value={form.phone}
                            onChange={(value) =>
                                setForm({ ...form, phone: value })
                            }
                            error={errors.phone}
                            required
                        />
                    </div>

                    <Champ
                        id="email"
                        label="E-mail"
                        type="email"
                        value={form.email}
                        onChange={(value) => setForm({ ...form, email: value })}
                        error={errors.email}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Champ
                            id="address"
                            label="Adresse de livraison"
                            value={form.address}
                            onChange={(value) =>
                                setForm({ ...form, address: value })
                            }
                            error={errors.address}
                        />
                        <Champ
                            id="city"
                            label="Ville"
                            value={form.city}
                            onChange={(value) =>
                                setForm({ ...form, city: value })
                            }
                            error={errors.city}
                        />
                    </div>

                    <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                            className="mt-0.5"
                            checked={form.whatsapp_opt_in}
                            onCheckedChange={(checked) =>
                                setForm({
                                    ...form,
                                    whatsapp_opt_in: checked === true,
                                })
                            }
                        />
                        <span>
                            Recevoir les nouveautés et promotions sur WhatsApp
                            <span className="block text-xs text-muted-foreground">
                                Décochez pour ne plus rien recevoir.
                            </span>
                        </span>
                    </label>

                    {/* ------------------------------------ Position */}
                    <div className="space-y-3 border-t pt-4">
                        <p className="text-sm font-medium">
                            Ma position de livraison
                        </p>

                        {customer.hasLocation ? (
                            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted px-3 py-2.5 text-xs">
                                <span className="flex items-center gap-2">
                                    <MapPin className="size-3.5 shrink-0 text-blue-700 dark:text-blue-400" />
                                    Position enregistrée
                                    {customer.accuracyLabel
                                        ? ` \u2014 ${customer.accuracyLabel}`
                                        : ''}
                                </span>
                                <span className="flex items-center gap-4">
                                    {customer.mapUrl ? (
                                        <a
                                            href={customer.mapUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1.5 underline underline-offset-4"
                                        >
                                            <ExternalLink className="size-3" />
                                            Voir sur la carte
                                        </a>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.delete(
                                                '/boutique/espace/position',
                                                { preserveScroll: true },
                                            )
                                        }
                                        className="flex items-center gap-1.5 text-muted-foreground underline underline-offset-4 transition-colors hover:text-destructive"
                                    >
                                        <MapPinOff className="size-3" />
                                        Effacer
                                    </button>
                                </span>
                            </div>
                        ) : null}

                        <PositionLivraison
                            position={position}
                            onChange={setPosition}
                        />
                    </div>

                    <div className="space-y-4 border-t pt-4">
                        <p className="text-sm font-medium">
                            Changer de mot de passe
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                (laissez vide pour le conserver)
                            </span>
                        </p>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Champ
                                id="password"
                                label="Nouveau mot de passe"
                                type="password"
                                value={form.password}
                                onChange={(value) =>
                                    setForm({ ...form, password: value })
                                }
                                error={errors.password}
                            />
                            <Champ
                                id="password_confirmation"
                                label="Confirmer"
                                type="password"
                                value={form.password_confirmation}
                                onChange={(value) =>
                                    setForm({
                                        ...form,
                                        password_confirmation: value,
                                    })
                                }
                            />
                        </div>
                    </div>

                    <Button
                        type="submit"
                        size="lg"
                        disabled={saving}
                        className="h-11 w-full sm:w-auto"
                    >
                        {saving ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Save className="size-4" />
                        )}
                        Enregistrer
                    </Button>
                </form>
            </div>
        </>
    );
}

function Champ({
    id,
    label,
    value,
    onChange,
    error,
    type = 'text',
    required,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    type?: string;
    required?: boolean;
}) {
    return (
        <div className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type={type}
                value={value}
                required={required}
                onChange={(event) => onChange(event.target.value)}
                className="h-11 sm:h-9"
            />
            <InputError message={error} />
        </div>
    );
}
