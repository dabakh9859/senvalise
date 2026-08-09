import { Head, router } from '@inertiajs/react';
import { Loader2, Mail, MapPin, Phone, Send } from 'lucide-react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function Contact({
    shop,
    customer,
}: {
    shop: {
        name: string;
        phone: string | null;
        email: string | null;
        address: string | null;
    };
    customer: {
        name: string;
        phone: string | null;
        email: string | null;
    } | null;
}) {
    const [form, setForm] = useState({
        name: customer?.name ?? '',
        phone: customer?.phone ?? '',
        email: customer?.email ?? '',
        subject: '',
        body: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setSending(true);

        router.post('/boutique/contact', form, {
            onError: setErrors,
            onSuccess: () => setForm({ ...form, subject: '', body: '' }),
            onFinish: () => setSending(false),
        });
    }

    return (
        <>
            <Head title="Nous contacter" />

            <div className="mx-auto max-w-4xl px-4 py-10">
                <header className="mb-8 space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Nous contacter
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Une question sur une valise, une commande, un coffre ?
                        Écrivez-nous.
                    </p>
                </header>

                <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
                    <form
                        onSubmit={submit}
                        className="verre space-y-4 p-4 sm:p-5"
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Votre nom</Label>
                                <Input
                                    id="name"
                                    value={form.name}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            name: event.target.value,
                                        })
                                    }
                                    required
                                    className="h-11 sm:h-9"
                                />
                                <InputError message={errors.name} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="phone">Téléphone</Label>
                                <Input
                                    id="phone"
                                    type="tel"
                                    value={form.phone}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            phone: event.target.value,
                                        })
                                    }
                                    className="h-11 sm:h-9"
                                />
                                <InputError message={errors.phone} />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="subject">Objet</Label>
                            <Input
                                id="subject"
                                value={form.subject}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        subject: event.target.value,
                                    })
                                }
                                placeholder="Disponibilité, livraison, coffre…"
                                className="h-11 sm:h-9"
                            />
                            <InputError message={errors.subject} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="body">Votre message</Label>
                            <Textarea
                                id="body"
                                rows={6}
                                value={form.body}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        body: event.target.value,
                                    })
                                }
                                required
                            />
                            <InputError message={errors.body} />
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            disabled={sending}
                            className="h-11 w-full sm:w-auto"
                        >
                            {sending ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Send className="size-4" />
                            )}
                            Envoyer
                        </Button>
                    </form>

                    <aside className="verre h-fit space-y-4 p-4 text-sm">
                        <p className="font-medium">{shop.name}</p>

                        {shop.phone ? (
                            <a
                                href={`tel:${shop.phone.replace(/\s/g, '')}`}
                                className="flex items-start gap-2 text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <Phone className="mt-0.5 size-4 shrink-0" />
                                {shop.phone}
                            </a>
                        ) : null}

                        {shop.email ? (
                            <a
                                href={`mailto:${shop.email}`}
                                className="flex items-start gap-2 break-all text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <Mail className="mt-0.5 size-4 shrink-0" />
                                {shop.email}
                            </a>
                        ) : null}

                        {shop.address ? (
                            <p className="flex items-start gap-2 text-muted-foreground">
                                <MapPin className="mt-0.5 size-4 shrink-0" />
                                {shop.address}
                            </p>
                        ) : null}
                    </aside>
                </div>
            </div>
        </>
    );
}
