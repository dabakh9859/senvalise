import { Head, Link, router } from '@inertiajs/react';
import { Loader2, PiggyBank, ShieldCheck, Truck } from 'lucide-react';
import { useState } from 'react';
import { PositionLivraison } from '@/components/boutique/position-livraison';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Position } from '@/hooks/use-geolocation';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

type Zone = {
    id: number;
    name: string;
    city: string | null;
    fee: number;
    delayLabel: string;
    note: string | null;
};

type VaultOption = {
    id: number;
    reference: string;
    label: string;
    saved: number;
};

export default function Commande({
    cart,
    zones,
    paymentMethods,
    customer,
    vaults,
}: {
    cart: {
        lines: Array<{ label: string; quantity: number; lineTotal: number }>;
        subtotal: number;
        count: number;
    };
    zones: Zone[];
    paymentMethods: Array<{ value: string; label: string }>;
    customer: {
        name: string;
        phone: string | null;
        email: string | null;
        address: string | null;
        city: string | null;
        latitude: number | null;
        longitude: number | null;
        locationAccuracy: number | null;
    } | null;
    vaults: VaultOption[];
}) {
    const [form, setForm] = useState({
        customer_name: customer?.name ?? '',
        customer_phone: customer?.phone ?? '',
        customer_email: customer?.email ?? '',
        delivery_address: customer?.address ?? '',
        delivery_city: customer?.city ?? '',
        delivery_note: '',
        delivery_zone_id: zones[0]?.id ?? 0,
        payment_method: paymentMethods[0]?.value ?? 'especes',
        vault_id: '' as string,
        note: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);

    // Position déjà consentie lors d'une commande précédente : on la
    // repropose plutôt que de redemander l'autorisation à chaque achat.
    const [position, setPosition] = useState<Position | null>(
        customer?.latitude != null && customer.longitude != null
            ? {
                  latitude: customer.latitude,
                  longitude: customer.longitude,
                  accuracy: customer.locationAccuracy,
              }
            : null,
    );
    const [zoneSuggeree, setZoneSuggeree] = useState<string | null>(null);

    const zone = zones.find(
        (candidate) => candidate.id === form.delivery_zone_id,
    );
    const fee = zone?.fee ?? 0;
    const total = cart.subtotal + fee;

    const vault = vaults.find(
        (candidate) => String(candidate.id) === form.vault_id,
    );
    const vaultCovers = vault ? vault.saved >= total : false;

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setSending(true);

        router.post(
            '/boutique/commande',
            {
                ...form,
                latitude: position?.latitude ?? null,
                longitude: position?.longitude ?? null,
                location_accuracy: position?.accuracy ?? null,
            },
            {
                onError: setErrors,
                onFinish: () => setSending(false),
            },
        );
    }

    return (
        <>
            <Head title="Valider ma commande" />

            <form
                onSubmit={submit}
                className="mx-auto max-w-5xl px-4 py-8 pb-28 lg:pb-8"
            >
                <h1 className="mb-6 text-2xl font-semibold tracking-tight">
                    Valider ma commande
                </h1>

                <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                    <div className="space-y-6">
                        {/* ---------------------------------- Coordonnées */}
                        <section className="verre space-y-4 p-4 sm:p-5">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="font-medium">Vos coordonnées</h2>
                                {!customer ? (
                                    <Link
                                        href="/boutique/connexion"
                                        className="text-xs text-[var(--vitrine-encre)]/60 underline underline-offset-4"
                                    >
                                        J’ai déjà un compte
                                    </Link>
                                ) : null}
                            </div>

                            {/* Commander sans compte est un choix : obliger un
                                visiteur à s'inscrire pour acheter une valise
                                revient à perdre la vente. */}
                            {!customer ? (
                                <p className="bg-[var(--vitrine-sable)] px-3 py-2 text-xs text-[var(--vitrine-encre)]/60">
                                    Pas besoin de compte pour commander. Vous
                                    recevrez un lien de suivi.
                                </p>
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Champ
                                    id="nom"
                                    label="Nom complet"
                                    value={form.customer_name}
                                    onChange={(value) =>
                                        setForm({
                                            ...form,
                                            customer_name: value,
                                        })
                                    }
                                    error={errors.customer_name}
                                    required
                                />
                                <Champ
                                    id="tel"
                                    label="Téléphone"
                                    type="tel"
                                    placeholder="77 000 00 00"
                                    value={form.customer_phone}
                                    onChange={(value) =>
                                        setForm({
                                            ...form,
                                            customer_phone: value,
                                        })
                                    }
                                    error={errors.customer_phone}
                                    required
                                />
                            </div>

                            <Champ
                                id="email"
                                label="E-mail (facultatif)"
                                type="email"
                                value={form.customer_email}
                                onChange={(value) =>
                                    setForm({ ...form, customer_email: value })
                                }
                                error={errors.customer_email}
                            />
                        </section>

                        {/* ---------------------------------- Livraison */}
                        <section className="verre space-y-4 p-4 sm:p-5">
                            <h2 className="flex items-center gap-2 font-medium">
                                <Truck className="size-4" />
                                Livraison
                            </h2>

                            <div className="grid gap-2">
                                {zones.map((candidate) => (
                                    <label
                                        key={candidate.id}
                                        className={cn(
                                            'flex cursor-pointer items-center justify-between gap-3 border p-3 transition-[border-color,background-color] duration-150',
                                            candidate.id ===
                                                form.delivery_zone_id
                                                ? 'border-[var(--vitrine-encre)] bg-[var(--vitrine-sable)]'
                                                : 'hover:bg-[var(--vitrine-sable)]',
                                        )}
                                    >
                                        <span className="flex items-start gap-3">
                                            <input
                                                type="radio"
                                                name="zone"
                                                className="mt-1"
                                                checked={
                                                    candidate.id ===
                                                    form.delivery_zone_id
                                                }
                                                onChange={() =>
                                                    setForm({
                                                        ...form,
                                                        delivery_zone_id:
                                                            candidate.id,
                                                    })
                                                }
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium">
                                                    {candidate.name}
                                                </span>
                                                <span className="block text-xs text-[var(--vitrine-encre)]/60">
                                                    {candidate.delayLabel}
                                                    {candidate.note
                                                        ? ` · ${candidate.note}`
                                                        : ''}
                                                </span>
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-sm font-medium tabular-nums">
                                            {candidate.fee === 0
                                                ? 'Offerte'
                                                : money(candidate.fee)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <InputError message={errors.delivery_zone_id} />

                            {/*
                             * La position est proposée après la zone : elle
                             * peut la corriger, et le client comprend mieux à
                             * quoi elle sert une fois la liste sous les yeux.
                             */}
                            <PositionLivraison
                                position={position}
                                onChange={setPosition}
                                onZoneSuggeree={(zone) => {
                                    setForm((courant) => ({
                                        ...courant,
                                        delivery_zone_id: zone.id,
                                    }));
                                    setZoneSuggeree(zone.name);
                                }}
                            />

                            {zoneSuggeree ? (
                                <p className="bg-[var(--vitrine-terre)]/10 px-3 py-2 text-xs text-[var(--vitrine-terre)]">
                                    Zone « {zoneSuggeree} » présélectionnée
                                    d’après votre position. Vous pouvez en
                                    changer.
                                </p>
                            ) : null}

                            <Champ
                                id="adresse"
                                label="Adresse de livraison"
                                placeholder="Quartier, rue, point de repère…"
                                value={form.delivery_address}
                                onChange={(value) =>
                                    setForm({
                                        ...form,
                                        delivery_address: value,
                                    })
                                }
                                error={errors.delivery_address}
                                required
                            />

                            <Champ
                                id="indication"
                                label="Indication pour le livreur (facultatif)"
                                placeholder="Immeuble bleu, 2e étage…"
                                value={form.delivery_note}
                                onChange={(value) =>
                                    setForm({ ...form, delivery_note: value })
                                }
                                error={errors.delivery_note}
                            />
                        </section>

                        {/* ---------------------------------- Paiement */}
                        <section className="verre space-y-4 p-4 sm:p-5">
                            <h2 className="font-medium">Paiement</h2>

                            {vaults.length > 0 ? (
                                <div className="space-y-2 border border-dashed p-3">
                                    <p className="flex items-center gap-2 text-sm font-medium">
                                        <PiggyBank className="size-4" />
                                        Payer avec un coffre
                                    </p>
                                    <select
                                        value={form.vault_id}
                                        onChange={(event) =>
                                            setForm({
                                                ...form,
                                                vault_id: event.target.value,
                                            })
                                        }
                                        className="h-10 w-full border bg-transparent px-3 text-sm"
                                    >
                                        <option value="">
                                            Ne pas utiliser de coffre
                                        </option>
                                        {vaults.map((candidate) => (
                                            <option
                                                key={candidate.id}
                                                value={String(candidate.id)}
                                            >
                                                {candidate.label} —{' '}
                                                {money(candidate.saved)}
                                            </option>
                                        ))}
                                    </select>
                                    {vault && !vaultCovers ? (
                                        <p className="text-xs text-[var(--vitrine-alerte)]">
                                            Ce coffre ne couvre pas le total,
                                            frais de livraison compris.
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}

                            {!vault ? (
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {paymentMethods.map((method) => (
                                        <label
                                            key={method.value}
                                            className={cn(
                                                'flex cursor-pointer items-center gap-3 border p-3 text-sm transition-[border-color,background-color] duration-150',
                                                method.value ===
                                                    form.payment_method
                                                    ? 'border-[var(--vitrine-encre)] bg-[var(--vitrine-sable)]'
                                                    : 'hover:bg-[var(--vitrine-sable)]',
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="paiement"
                                                checked={
                                                    method.value ===
                                                    form.payment_method
                                                }
                                                onChange={() =>
                                                    setForm({
                                                        ...form,
                                                        payment_method:
                                                            method.value,
                                                    })
                                                }
                                            />
                                            {method.label}
                                        </label>
                                    ))}
                                </div>
                            ) : null}

                            <p className="flex items-start gap-2 text-xs text-[var(--vitrine-encre)]/60">
                                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                                Vous réglez à la livraison. Rien n’est prélevé
                                maintenant.
                            </p>

                            <div className="grid gap-2">
                                <Label htmlFor="note">
                                    Message pour la boutique (facultatif)
                                </Label>
                                <Textarea
                                    id="note"
                                    rows={2}
                                    value={form.note}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            note: event.target.value,
                                        })
                                    }
                                />
                            </div>
                        </section>
                    </div>

                    {/* ---------------------------------- Récapitulatif */}
                    <aside className="verre h-fit space-y-3 p-4 lg:sticky lg:top-24">
                        <p className="font-medium">Votre commande</p>

                        <ul className="space-y-2 border-b pb-3 text-sm">
                            {cart.lines.map((line) => (
                                <li
                                    key={line.label}
                                    className="flex justify-between gap-3"
                                >
                                    <span className="min-w-0 truncate text-[var(--vitrine-encre)]/60">
                                        {line.quantity} × {line.label}
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                        {money(line.lineTotal)}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-[var(--vitrine-encre)]/60">
                                    Sous-total
                                </dt>
                                <dd className="tabular-nums">
                                    {money(cart.subtotal)}
                                </dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-[var(--vitrine-encre)]/60">
                                    Livraison {zone ? `— ${zone.name}` : ''}
                                </dt>
                                <dd className="tabular-nums">
                                    {fee === 0 ? 'Offerte' : money(fee)}
                                </dd>
                            </div>
                            <div className="flex justify-between border-t pt-2 text-base font-semibold">
                                <dt>Total</dt>
                                <dd className="tabular-nums">{money(total)}</dd>
                            </div>
                        </dl>

                        <Button
                            type="submit"
                            size="lg"
                            disabled={
                                sending || (vault !== undefined && !vaultCovers)
                            }
                            className="hidden h-11 w-full text-base lg:flex"
                        >
                            {sending ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            Confirmer la commande
                        </Button>
                    </aside>
                </div>

                {/* Barre de validation sous le pouce sur téléphone. Elle se
                    pose au-dessus de la barre de raccourcis de l'enveloppe —
                    à `bottom-0` elle passerait dessous. */}
                <div className="verre-dense fixed inset-x-0 bottom-16 z-30 border-x-0 border-b-0 p-3 lg:hidden">
                    <Button
                        type="submit"
                        size="lg"
                        disabled={
                            sending || (vault !== undefined && !vaultCovers)
                        }
                        className="h-12 w-full justify-between text-base"
                    >
                        <span className="flex items-center gap-2">
                            {sending ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            Confirmer
                        </span>
                        <span className="tabular-nums">{money(total)}</span>
                    </Button>
                </div>
            </form>
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
    placeholder,
    required,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    type?: string;
    placeholder?: string;
    required?: boolean;
}) {
    return (
        <div className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type={type}
                value={value}
                placeholder={placeholder}
                required={required}
                onChange={(event) => onChange(event.target.value)}
                className="h-11 sm:h-9"
            />
            <InputError message={error} />
        </div>
    );
}
