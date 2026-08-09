import { Head, router } from '@inertiajs/react';
import { Image as ImageIcon, Loader2, Save } from 'lucide-react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Settings = {
    shop_name: string;
    shop_tagline: string;
    shop_phone: string;
    shop_email: string;
    shop_address: string;
    shop_ninea: string;
    shop_rc: string;
    tax_rate: number | string;
    tax_label: string;
    barcode_prefix: string;
    allow_negative_stock: boolean;
    default_low_stock_threshold: number | string;
    quote_validity_days: number | string;
    invoice_terms: string;
    receipt_footer: string;
};

export default function ReglagesBoutique({
    settings,
    barcodeSample,
    logo,
}: {
    settings: Settings;
    barcodeSample: string | null;
    /** Adresse du logo déposé, null tant qu'il n'y en a pas. */
    logo: string | null;
}) {
    const [form, setForm] = useState({
        ...settings,
        tax_rate: String(settings.tax_rate ?? 0),
        default_low_stock_threshold: String(
            settings.default_low_stock_threshold ?? 3,
        ),
        quote_validity_days: String(settings.quote_validity_days ?? 15),
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);
    const [nouveauLogo, setNouveauLogo] = useState<File | null>(null);

    function update(key: keyof Settings, value: string | boolean) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function submit(event: React.FormEvent) {
        event.preventDefault();
        setProcessing(true);

        /*
         * POST plutôt que PUT : un envoi multipart en PUT n'est pas lu par
         * PHP. Le champ `_method` rétablit le verbe côté Laravel.
         */
        router.post(
            '/reglages/boutique',
            {
                ...form,
                _method: 'put',
                tax_rate: Number(form.tax_rate) || 0,
                default_low_stock_threshold:
                    Number(form.default_low_stock_threshold) || 0,
                quote_validity_days: Number(form.quote_validity_days) || 15,
                ...(nouveauLogo ? { logo: nouveauLogo } : {}),
            },
            {
                forceFormData: true,
                preserveScroll: true,
                onError: (received) => setErrors(received),
                onSuccess: () => {
                    setErrors({});
                    setNouveauLogo(null);
                },
                onFinish: () => setProcessing(false),
            },
        );
    }

    return (
        <>
            <Head title="Réglages de la boutique" />

            <form onSubmit={submit} className="space-y-4">
                <PageHeader
                    title="Informations de la boutique"
                    description="Ce qui apparaît en haut des tickets, devis, factures et bons de livraison."
                    actions={
                        <Button type="submit" disabled={processing}>
                            {processing ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Save className="size-4" />
                            )}
                            Enregistrer
                        </Button>
                    }
                />

                <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Identité</CardTitle>
                            <CardDescription>
                                En-tête des documents commerciaux.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            {/*
                             * Le logo de l'enseigne. Déposé, il remplace
                             * l'écusson dessiné partout : boutique en ligne,
                             * barre latérale, documents.
                             */}
                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="logo">Logo de l’enseigne</Label>

                                <div className="flex flex-wrap items-center gap-4">
                                    <span className="flex size-16 shrink-0 items-center justify-center border bg-muted">
                                        {nouveauLogo ? (
                                            <img
                                                src={URL.createObjectURL(
                                                    nouveauLogo,
                                                )}
                                                alt=""
                                                className="size-full object-contain p-1"
                                            />
                                        ) : logo ? (
                                            <img
                                                src={logo}
                                                alt=""
                                                className="size-full object-contain p-1"
                                            />
                                        ) : (
                                            <ImageIcon className="size-5 text-muted-foreground" />
                                        )}
                                    </span>

                                    <div className="min-w-0 flex-1 space-y-2">
                                        <Input
                                            id="logo"
                                            type="file"
                                            accept="image/*"
                                            onChange={(event) =>
                                                setNouveauLogo(
                                                    event.target.files?.[0] ??
                                                        null,
                                                )
                                            }
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            PNG à fond transparent de préférence.
                                            Sans logo, un écusson dessiné aux
                                            couleurs de l’enseigne est utilisé.
                                        </p>
                                        {logo ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    router.delete(
                                                        '/reglages/boutique/logo',
                                                        {
                                                            preserveScroll: true,
                                                        },
                                                    )
                                                }
                                                className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-destructive"
                                            >
                                                Retirer le logo
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                                <InputError message={errors.logo} />
                            </div>

                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="shop_name">
                                    Nom de la boutique{' '}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="shop_name"
                                    value={form.shop_name}
                                    onChange={(event) =>
                                        update('shop_name', event.target.value)
                                    }
                                    required
                                />
                                <InputError message={errors.shop_name} />
                            </div>

                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="shop_tagline">
                                    Slogan / activité
                                </Label>
                                <Input
                                    id="shop_tagline"
                                    value={form.shop_tagline}
                                    onChange={(event) =>
                                        update(
                                            'shop_tagline',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="Vente de valises et bagages"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="shop_phone">Téléphone</Label>
                                <Input
                                    id="shop_phone"
                                    value={form.shop_phone}
                                    onChange={(event) =>
                                        update('shop_phone', event.target.value)
                                    }
                                    placeholder="77 885 83 74"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="shop_email">E-mail</Label>
                                <Input
                                    id="shop_email"
                                    type="email"
                                    value={form.shop_email}
                                    onChange={(event) =>
                                        update('shop_email', event.target.value)
                                    }
                                />
                                <InputError message={errors.shop_email} />
                            </div>

                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="shop_address">Adresse</Label>
                                <Input
                                    id="shop_address"
                                    value={form.shop_address}
                                    onChange={(event) =>
                                        update(
                                            'shop_address',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="Quartier, ville"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="shop_ninea">NINEA</Label>
                                <Input
                                    id="shop_ninea"
                                    value={form.shop_ninea}
                                    onChange={(event) =>
                                        update('shop_ninea', event.target.value)
                                    }
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="shop_rc">
                                    Registre de commerce
                                </Label>
                                <Input
                                    id="shop_rc"
                                    value={form.shop_rc}
                                    onChange={(event) =>
                                        update('shop_rc', event.target.value)
                                    }
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Ventes et documents</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="tax_rate">
                                    Taux de taxe (%)
                                </Label>
                                <Input
                                    id="tax_rate"
                                    value={form.tax_rate}
                                    onChange={(event) =>
                                        update(
                                            'tax_rate',
                                            event.target.value.replace(
                                                /\D/g,
                                                '',
                                            ),
                                        )
                                    }
                                    inputMode="numeric"
                                    className="tabular-nums"
                                />
                                <p className="text-xs text-muted-foreground">
                                    0 si la boutique n'est pas assujettie à la
                                    TVA.
                                </p>
                                <InputError message={errors.tax_rate} />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="tax_label">
                                    Libellé de la taxe
                                </Label>
                                <Input
                                    id="tax_label"
                                    value={form.tax_label}
                                    onChange={(event) =>
                                        update('tax_label', event.target.value)
                                    }
                                    placeholder="TVA"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="quote_validity_days">
                                    Validité des devis (jours)
                                </Label>
                                <Input
                                    id="quote_validity_days"
                                    value={form.quote_validity_days}
                                    onChange={(event) =>
                                        update(
                                            'quote_validity_days',
                                            event.target.value.replace(
                                                /\D/g,
                                                '',
                                            ),
                                        )
                                    }
                                    inputMode="numeric"
                                    className="tabular-nums"
                                />
                                <InputError
                                    message={errors.quote_validity_days}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="default_low_stock_threshold">
                                    Seuil d'alerte par défaut
                                </Label>
                                <Input
                                    id="default_low_stock_threshold"
                                    value={form.default_low_stock_threshold}
                                    onChange={(event) =>
                                        update(
                                            'default_low_stock_threshold',
                                            event.target.value.replace(
                                                /\D/g,
                                                '',
                                            ),
                                        )
                                    }
                                    inputMode="numeric"
                                    className="tabular-nums"
                                />
                            </div>

                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="invoice_terms">
                                    Conditions imprimées sur les documents
                                </Label>
                                <Textarea
                                    id="invoice_terms"
                                    value={form.invoice_terms}
                                    onChange={(event) =>
                                        update(
                                            'invoice_terms',
                                            event.target.value,
                                        )
                                    }
                                    rows={3}
                                />
                            </div>

                            <div className="grid gap-2 sm:col-span-2">
                                <Label htmlFor="receipt_footer">
                                    Bas de ticket de caisse
                                </Label>
                                <Input
                                    id="receipt_footer"
                                    value={form.receipt_footer}
                                    onChange={(event) =>
                                        update(
                                            'receipt_footer',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="Merci de votre visite"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="xl:col-span-2">
                        <CardHeader>
                            <CardTitle>Stock et codes-barres</CardTitle>
                            <CardDescription>
                                Le préfixe 200 à 299 est réservé par la norme
                                GS1 aux codes fabriqués en interne : aucun
                                risque de collision avec le code d'un fabricant.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="barcode_prefix">
                                    Préfixe des codes-barres
                                </Label>
                                <Input
                                    id="barcode_prefix"
                                    value={form.barcode_prefix}
                                    onChange={(event) =>
                                        update(
                                            'barcode_prefix',
                                            event.target.value.replace(
                                                /\D/g,
                                                '',
                                            ),
                                        )
                                    }
                                    inputMode="numeric"
                                    maxLength={4}
                                    className="w-32 tabular-nums"
                                />
                                <InputError message={errors.barcode_prefix} />
                                <p className="text-xs text-muted-foreground">
                                    Ne change que les codes générés ensuite :
                                    les articles déjà étiquetés gardent le leur.
                                </p>
                            </div>

                            {barcodeSample ? (
                                <div className="grid gap-2">
                                    <Label>Exemple de rendu</Label>
                                    <div
                                        className="w-fit rounded-md border bg-white p-2 text-foreground [&_svg]:h-auto [&_svg]:w-48"
                                        dangerouslySetInnerHTML={{
                                            __html: barcodeSample,
                                        }}
                                    />
                                </div>
                            ) : null}

                            <label className="flex items-start gap-2 text-sm sm:col-span-2">
                                <Checkbox
                                    checked={Boolean(form.allow_negative_stock)}
                                    onCheckedChange={(checked) =>
                                        update(
                                            'allow_negative_stock',
                                            checked === true,
                                        )
                                    }
                                    className="mt-0.5"
                                />
                                <span>
                                    Autoriser le stock négatif
                                    <span className="block text-xs text-muted-foreground">
                                        À n'activer que si vous vendez parfois
                                        avant d'avoir saisi l'arrivage. Sinon la
                                        caisse bloque les ventes sans stock, ce
                                        qui évite les erreurs.
                                    </span>
                                </span>
                            </label>
                        </CardContent>
                    </Card>
                </div>
            </form>
        </>
    );
}

ReglagesBoutique.layout = {
    breadcrumbs: [
        { title: 'Réglages', href: '/reglages/boutique' },
        { title: 'Boutique', href: '/reglages/boutique' },
    ],
};
