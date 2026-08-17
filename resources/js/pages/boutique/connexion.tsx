import { Head, Link, router } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Connexion() {
    const [form, setForm] = useState({
        identifiant: '',
        password: '',
        remember: false,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setSending(true);

        router.post('/boutique/connexion', form, {
            onError: setErrors,
            onFinish: () => setSending(false),
        });
    }

    return (
        <>
            <Head title="Connexion" />

            <div className="mx-auto max-w-md px-4 py-12">
                <form
                    onSubmit={submit}
                    className="anim-entree verre space-y-5 p-6"
                >
                    <div className="space-y-1 text-center">
                        <h1 className="text-xl font-semibold tracking-tight">
                            Bon retour
                        </h1>
                        <p className="text-sm text-[var(--vitrine-encre)]/60">
                            Retrouvez vos commandes et vos coffres.
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="identifiant">E-mail ou téléphone</Label>
                        <Input
                            id="identifiant"
                            autoFocus
                            autoComplete="username"
                            value={form.identifiant}
                            onChange={(event) =>
                                setForm({
                                    ...form,
                                    identifiant: event.target.value,
                                })
                            }
                            className="h-11"
                        />
                        <InputError message={errors.identifiant} />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="password">Mot de passe</Label>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            value={form.password}
                            onChange={(event) =>
                                setForm({
                                    ...form,
                                    password: event.target.value,
                                })
                            }
                            className="h-11"
                        />
                        <InputError message={errors.password} />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                            checked={form.remember}
                            onCheckedChange={(checked) =>
                                setForm({ ...form, remember: checked === true })
                            }
                        />
                        Rester connecté
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
                        Se connecter
                    </Button>

                    <p className="text-center text-sm text-[var(--vitrine-encre)]/60">
                        Pas encore de compte ?{' '}
                        <Link
                            href="/boutique/inscription"
                            className="font-medium text-[var(--vitrine-encre)] underline underline-offset-4"
                        >
                            Créer un compte
                        </Link>
                    </p>

                    <p className="border-t pt-4 text-center text-xs text-[var(--vitrine-encre)]/60">
                        Vous pouvez aussi{' '}
                        <Link
                            href="/boutique/catalogue"
                            className="underline underline-offset-4"
                        >
                            commander sans compte
                        </Link>
                        .
                    </p>
                </form>
            </div>
        </>
    );
}
