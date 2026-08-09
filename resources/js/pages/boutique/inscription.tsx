import { Head, Link, router } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Inscription() {
    const [form, setForm] = useState({
        name: '',
        phone: '',
        email: '',
        city: '',
        address: '',
        password: '',
        password_confirmation: '',
        whatsapp_opt_in: false,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setSending(true);

        router.post('/boutique/inscription', form, {
            onError: setErrors,
            onFinish: () => setSending(false),
        });
    }

    return (
        <>
            <Head title="Créer un compte" />

            <div className="mx-auto max-w-xl px-4 py-12">
                <form
                    onSubmit={submit}
                    className="anim-entree verre space-y-5 p-6"
                >
                    <div className="space-y-1 text-center">
                        <h1 className="text-xl font-semibold tracking-tight">
                            Créer mon compte
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Pour suivre vos commandes et ouvrir un coffre.
                        </p>
                    </div>

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
                            placeholder="77 000 00 00"
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
                        label="E-mail (facultatif)"
                        type="email"
                        value={form.email}
                        onChange={(value) => setForm({ ...form, email: value })}
                        error={errors.email}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Champ
                            id="city"
                            label="Ville"
                            value={form.city}
                            onChange={(value) =>
                                setForm({ ...form, city: value })
                            }
                            error={errors.city}
                        />
                        <Champ
                            id="address"
                            label="Adresse"
                            value={form.address}
                            onChange={(value) =>
                                setForm({ ...form, address: value })
                            }
                            error={errors.address}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Champ
                            id="password"
                            label="Mot de passe"
                            type="password"
                            value={form.password}
                            onChange={(value) =>
                                setForm({ ...form, password: value })
                            }
                            error={errors.password}
                            required
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
                            required
                        />
                    </div>

                    {/*
                     * Le consentement est demandé, pas supposé. C'est ce qui
                     * protège le numéro WhatsApp de la boutique — et c'est la
                     * loi du bon sens : personne n'aime les publicités qu'il
                     * n'a pas demandées.
                     */}
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
                            Je souhaite recevoir les nouveautés et promotions
                            sur WhatsApp
                            <span className="block text-xs text-muted-foreground">
                                Vous pourrez vous désinscrire à tout moment en
                                répondant « stop ».
                            </span>
                        </span>
                    </label>

                    <Button
                        type="submit"
                        size="lg"
                        disabled={sending}
                        className="h-11 w-full"
                    >
                        {sending ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Créer mon compte
                    </Button>

                    <p className="text-center text-sm text-muted-foreground">
                        Déjà client ?{' '}
                        <Link
                            href="/boutique/connexion"
                            className="font-medium text-foreground underline underline-offset-4"
                        >
                            Se connecter
                        </Link>
                    </p>
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
                className="h-11"
            />
            <InputError message={error} />
        </div>
    );
}
