import { Head, router } from '@inertiajs/react';
import {
    CheckCircle2,
    ExternalLink,
    ImageIcon,
    Loader2,
    Mail,
    MessageSquare,
    Power,
    RefreshCw,
    Save,
    Send,
    TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type ImageSearch = {
    configured: boolean;
    maskedKey: string | null;
    fromEnvironment: boolean;
};

type MailSettings = {
    configured: boolean;
    has_password: boolean;
    mail_host: string;
    mail_port: string | number;
    mail_username: string;
    mail_encryption: string;
    mail_from_address: string;
    mail_from_name: string;
};

type WahaSettings = {
    url: string;
    session: string;
    hasApiKey: boolean;
    configured: boolean;
    status: {
        connected: boolean;
        status: string;
        label: string;
        detail: string | null;
    } | null;
};

type CloudTemplate = {
    name: string;
    language: string;
    status: string;
    category: string;
    body: string;
};

type CloudSettings = {
    phoneNumberId: string;
    businessAccountId: string;
    apiVersion: string;
    hasToken: boolean;
    hasAppSecret: boolean;
    hasVerifyToken: boolean;
    configured: boolean;
    webhookUrl: string;
    health: {
        configured: boolean;
        name: string | null;
        number: string | null;
        quality: string | null;
        qualityLabel: string;
        tier: string | null;
        tierLabel: string;
        error: string | null;
    };
    templates: CloudTemplate[];
};

type WhatsappSettings = {
    driver: 'cloud' | 'waha';
    countryCode: string;
    cloud: CloudSettings;
    waha: WahaSettings;
};

export default function Integrations({
    imageSearch,
    mail,
    whatsapp,
}: {
    imageSearch: ImageSearch;
    mail: MailSettings;
    whatsapp: WhatsappSettings;
}) {
    return (
        <>
            <Head title="Intégrations" />

            <div className="space-y-4">
                <PageHeader
                    title="Intégrations"
                    description="Services extérieurs branchés sur l'application."
                />

                <WhatsappCloudCard settings={whatsapp} />

                <div className="grid gap-4 xl:grid-cols-2">
                    <MailCard settings={mail} />
                    <WahaCard settings={whatsapp} />
                    <ImageSearchCard settings={imageSearch} />
                </div>
            </div>
        </>
    );
}

/* -------------------------------------------------------------------------- */

function MailCard({ settings }: { settings: MailSettings }) {
    const [form, setForm] = useState({
        mail_host: settings.mail_host ?? '',
        mail_port: String(settings.mail_port ?? 587),
        mail_username: settings.mail_username ?? '',
        mail_password: '',
        mail_encryption: settings.mail_encryption || 'tls',
        mail_from_address: settings.mail_from_address ?? '',
        mail_from_name: settings.mail_from_name ?? '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    function save(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);

        router.put(
            '/reglages/integrations/email',
            { ...form, mail_port: Number(form.mail_port) || 587 },
            {
                preserveScroll: true,
                onError: setErrors,
                onSuccess: () => {
                    setErrors({});
                    setForm((current) => ({ ...current, mail_password: '' }));
                },
                onFinish: () => setSaving(false),
            },
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Mail className="size-4" />
                    Envoi d'e-mails
                </CardTitle>
                <CardDescription>
                    Serveur utilisé pour envoyer les messages aux clients.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                <StatusLine
                    ok={settings.configured}
                    okText={`Configuré — envoi depuis ${settings.mail_from_address}`}
                    koText="Non configuré. Renseignez le serveur de votre fournisseur d'e-mail."
                />

                <form onSubmit={save} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="mail_host">Serveur (SMTP)</Label>
                            <Input
                                id="mail_host"
                                value={form.mail_host}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        mail_host: event.target.value,
                                    })
                                }
                                placeholder="smtp.gmail.com"
                            />
                            <InputError message={errors.mail_host} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="mail_port">Port</Label>
                            <Input
                                id="mail_port"
                                value={form.mail_port}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        mail_port: event.target.value.replace(
                                            /\D/g,
                                            '',
                                        ),
                                    })
                                }
                                inputMode="numeric"
                                className="tabular-nums"
                            />
                            <InputError message={errors.mail_port} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="mail_encryption">Chiffrement</Label>
                            <Select
                                value={form.mail_encryption}
                                onValueChange={(value) =>
                                    setForm({ ...form, mail_encryption: value })
                                }
                            >
                                <SelectTrigger
                                    id="mail_encryption"
                                    className="w-full"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="tls">
                                        TLS (port 587)
                                    </SelectItem>
                                    <SelectItem value="ssl">
                                        SSL (port 465)
                                    </SelectItem>
                                    <SelectItem value="none">Aucun</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="mail_username">Identifiant</Label>
                            <Input
                                id="mail_username"
                                value={form.mail_username}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        mail_username: event.target.value,
                                    })
                                }
                                autoComplete="off"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="mail_password">Mot de passe</Label>
                            <Input
                                id="mail_password"
                                type="password"
                                value={form.mail_password}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        mail_password: event.target.value,
                                    })
                                }
                                placeholder={
                                    settings.has_password
                                        ? 'Laisser vide pour conserver'
                                        : ''
                                }
                                autoComplete="new-password"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="mail_from_address">
                                Adresse d'expédition
                            </Label>
                            <Input
                                id="mail_from_address"
                                type="email"
                                value={form.mail_from_address}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        mail_from_address: event.target.value,
                                    })
                                }
                                placeholder="contact@senvalise.sn"
                            />
                            <InputError message={errors.mail_from_address} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="mail_from_name">Nom affiché</Label>
                            <Input
                                id="mail_from_name"
                                value={form.mail_from_name}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        mail_from_name: event.target.value,
                                    })
                                }
                                placeholder="SenValise"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={saving}>
                            {saving ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Save className="size-4" />
                            )}
                            Enregistrer
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            disabled={!settings.configured || testing}
                            onClick={() => {
                                setTesting(true);
                                router.post(
                                    '/reglages/integrations/email/test',
                                    {},
                                    {
                                        preserveScroll: true,
                                        onFinish: () => setTesting(false),
                                    },
                                );
                            }}
                        >
                            {testing ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Send className="size-4" />
                            )}
                            M'envoyer un test
                        </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Avec Gmail, utilisez un « mot de passe d'application »
                        plutôt que votre mot de passe habituel. Le mot de passe
                        est chiffré avant enregistrement.
                    </p>
                </form>
            </CardContent>
        </Card>
    );
}

/* -------------------------------------------------------------------------- */

const QUALITY_TONE: Record<string, string> = {
    GREEN: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    YELLOW: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    RED: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

/**
 * WhatsApp par l'API officielle de Meta.
 *
 * Trois blocs : ce qu'il faut recopier depuis le tableau de bord Meta, ce
 * qu'il faut recopier chez Meta (l'adresse du webhook), et l'état de santé du
 * numéro — la note de qualité et le palier d'envoi, qui préviennent avant que
 * Meta ne coupe.
 */
function WhatsappCloudCard({ settings }: { settings: WhatsappSettings }) {
    const cloud = settings.cloud;
    const [form, setForm] = useState({
        whatsapp_driver: settings.driver,
        whatsapp_phone_number_id: cloud.phoneNumberId ?? '',
        whatsapp_business_account_id: cloud.businessAccountId ?? '',
        whatsapp_api_version: cloud.apiVersion ?? 'v23.0',
        whatsapp_token: '',
        whatsapp_app_secret: '',
        whatsapp_verify_token: '',
        phone_country_code: settings.countryCode ?? '221',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const approved = cloud.templates.filter((t) => t.status === 'APPROVED');

    function save(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);

        router.put('/reglages/integrations/whatsapp/cloud', form, {
            preserveScroll: true,
            onError: setErrors,
            onSuccess: () => {
                setErrors({});
                setForm((current) => ({
                    ...current,
                    whatsapp_token: '',
                    whatsapp_app_secret: '',
                    whatsapp_verify_token: '',
                }));
            },
            onFinish: () => setSaving(false),
        });
    }

    async function copyWebhook() {
        await navigator.clipboard.writeText(cloud.webhookUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="size-4" />
                    WhatsApp — API officielle (Cloud API)
                </CardTitle>
                <CardDescription>
                    La voie autorisée par Meta pour écrire à vos clients. Créez
                    une application sur developers.facebook.com, ajoutez le
                    produit WhatsApp, puis recopiez ici les identifiants.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* Santé du numéro */}
                {cloud.configured ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                        <div
                            className={`rounded-lg px-3 py-2 ${
                                QUALITY_TONE[cloud.health.quality ?? ''] ??
                                'bg-muted text-muted-foreground'
                            }`}
                        >
                            <p className="text-xs opacity-80">
                                Note de qualité
                            </p>
                            <p className="text-sm font-medium">
                                {cloud.health.qualityLabel}
                            </p>
                        </div>
                        <div className="rounded-lg bg-muted px-3 py-2">
                            <p className="text-xs text-muted-foreground">
                                Limite d’envoi
                            </p>
                            <p className="text-sm font-medium">
                                {cloud.health.tierLabel}
                            </p>
                        </div>
                        <div className="rounded-lg bg-muted px-3 py-2">
                            <p className="text-xs text-muted-foreground">
                                Numéro
                            </p>
                            <p className="truncate text-sm font-medium">
                                {cloud.health.number ?? '—'}
                            </p>
                        </div>
                    </div>
                ) : null}

                {cloud.health.error ? (
                    <p className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        {cloud.health.error}
                    </p>
                ) : null}

                {cloud.health.quality === 'RED' ? (
                    <p className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        <span>
                            Trop de clients ont bloqué ou signalé vos messages.
                            Arrêtez les envois publicitaires plusieurs jours :
                            au rouge, Meta finit par suspendre le numéro.
                        </span>
                    </p>
                ) : null}

                <form onSubmit={save} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="wa-phone-id">
                                Identifiant du numéro
                            </Label>
                            <Input
                                id="wa-phone-id"
                                inputMode="numeric"
                                value={form.whatsapp_phone_number_id}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        whatsapp_phone_number_id:
                                            event.target.value,
                                    })
                                }
                                placeholder="123456789012345"
                            />
                            <InputError
                                message={errors.whatsapp_phone_number_id}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="wa-waba">
                                Identifiant du compte professionnel
                            </Label>
                            <Input
                                id="wa-waba"
                                inputMode="numeric"
                                value={form.whatsapp_business_account_id}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        whatsapp_business_account_id:
                                            event.target.value,
                                    })
                                }
                                placeholder="987654321098765"
                            />
                            <InputError
                                message={errors.whatsapp_business_account_id}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="wa-token">
                            Jeton d’accès permanent
                            {cloud.hasToken ? (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    (enregistré — laissez vide pour le conserver)
                                </span>
                            ) : null}
                        </Label>
                        <Input
                            id="wa-token"
                            type="password"
                            autoComplete="new-password"
                            value={form.whatsapp_token}
                            onChange={(event) =>
                                setForm({
                                    ...form,
                                    whatsapp_token: event.target.value,
                                })
                            }
                            placeholder={cloud.hasToken ? '••••••••' : 'EAAG…'}
                        />
                        <p className="text-xs text-muted-foreground">
                            Créez-le depuis un <strong>utilisateur système</strong>{' '}
                            (Paramètres de l’entreprise → Utilisateurs système)
                            avec les droits whatsapp_business_messaging et
                            whatsapp_business_management. Le jeton temporaire du
                            tableau de bord expire au bout de 24 h.
                        </p>
                        <InputError message={errors.whatsapp_token} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="wa-secret">
                                Clé secrète de l’application
                                {cloud.hasAppSecret ? (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        (enregistrée)
                                    </span>
                                ) : null}
                            </Label>
                            <Input
                                id="wa-secret"
                                type="password"
                                autoComplete="new-password"
                                value={form.whatsapp_app_secret}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        whatsapp_app_secret: event.target.value,
                                    })
                                }
                                placeholder={
                                    cloud.hasAppSecret ? '••••••••' : ''
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                Sert à vérifier que les appels reçus viennent bien
                                de Meta.
                            </p>
                            <InputError message={errors.whatsapp_app_secret} />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="wa-verify">
                                Jeton de vérification du webhook
                                {cloud.hasVerifyToken ? (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        (enregistré)
                                    </span>
                                ) : null}
                            </Label>
                            <Input
                                id="wa-verify"
                                type="password"
                                autoComplete="new-password"
                                value={form.whatsapp_verify_token}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        whatsapp_verify_token:
                                            event.target.value,
                                    })
                                }
                                placeholder={
                                    cloud.hasVerifyToken ? '••••••••' : 'un mot de passe de votre choix'
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                Vous l’inventez, puis vous le recopiez chez Meta.
                            </p>
                            <InputError message={errors.whatsapp_verify_token} />
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="wa-country">Indicatif du pays</Label>
                            <Input
                                id="wa-country"
                                inputMode="numeric"
                                value={form.phone_country_code}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        phone_country_code: event.target.value,
                                    })
                                }
                                placeholder="221"
                            />
                            <p className="text-xs text-muted-foreground">
                                Ajouté aux numéros saisis sans indicatif.
                            </p>
                            <InputError message={errors.phone_country_code} />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="wa-driver">Mode d’envoi</Label>
                            <Select
                                value={form.whatsapp_driver}
                                onValueChange={(value) =>
                                    setForm({
                                        ...form,
                                        whatsapp_driver: value as
                                            | 'cloud'
                                            | 'waha',
                                    })
                                }
                            >
                                <SelectTrigger id="wa-driver">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cloud">
                                        API officielle (recommandé)
                                    </SelectItem>
                                    <SelectItem value="waha">
                                        WAHA — essai, risque de bannissement
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <InputError message={errors.whatsapp_driver} />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={saving}>
                            {saving ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Save className="size-4" />
                            )}
                            Enregistrer
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!cloud.configured}
                            onClick={() =>
                                router.post(
                                    '/reglages/integrations/whatsapp/cloud/test',
                                    {},
                                    { preserveScroll: true },
                                )
                            }
                        >
                            <RefreshCw className="size-4" />
                            Tester la connexion
                        </Button>
                    </div>
                </form>

                {/* Adresse à recopier chez Meta */}
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                    <p className="text-sm font-medium">
                        Adresse du webhook à déclarer chez Meta
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-xs">
                            {cloud.webhookUrl}
                        </code>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void copyWebhook()}
                        >
                            {copied ? (
                                <CheckCircle2 className="size-4" />
                            ) : null}
                            {copied ? 'Copié' : 'Copier'}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Dans votre application Meta → WhatsApp → Configuration,
                        collez cette adresse, votre jeton de vérification, puis
                        abonnez-vous au champ <strong>messages</strong>. Sans
                        cela, l’application ne saura ni qui vous répond, ni qui
                        demande à ne plus être contacté.
                    </p>
                </div>

                {/* Modèles approuvés */}
                <div className="space-y-2">
                    <p className="text-sm font-medium">
                        Modèles approuvés{' '}
                        <span className="font-normal text-muted-foreground">
                            ({approved.length})
                        </span>
                    </p>
                    {approved.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            Aucun modèle approuvé pour l’instant. Créez-les dans
                            le gestionnaire WhatsApp de Meta : hors des 24 h qui
                            suivent un message du client, c’est le seul moyen de
                            le joindre.
                        </p>
                    ) : (
                        <ul className="divide-y rounded-lg border">
                            {approved.map((template) => (
                                <li
                                    key={`${template.name}-${template.language}`}
                                    className="px-3 py-2"
                                >
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                        {template.name}
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                                            {template.category}
                                        </span>
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {template.language}
                                        </span>
                                    </p>
                                    {template.body ? (
                                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                            {template.body}
                                        </p>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

/* -------------------------------------------------------------------------- */

function WahaCard({ settings }: { settings: WhatsappSettings }) {
    const waha = settings.waha;
    const [form, setForm] = useState({
        waha_url: waha.url ?? '',
        waha_api_key: '',
        waha_session: waha.session ?? 'default',
        phone_country_code: settings.countryCode ?? '221',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [live, setLive] = useState(waha.status);
    const [qr, setQr] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    const needsScan = live?.status === 'SCAN_QR_CODE';

    async function refresh() {
        if (!waha.configured) {
            return;
        }

        setChecking(true);

        try {
            const response = await fetch(
                '/reglages/integrations/whatsapp/etat',
                { headers: { Accept: 'application/json' } },
            );

            if (response.ok) {
                const payload = await response.json();
                setLive(payload.configured ? payload : null);
                setQr(payload.qr ?? null);
            }
        } catch {
            // Silencieux : le bouton reste disponible pour réessayer.
        } finally {
            setChecking(false);
        }
    }

    /*
     * Tant que le QR code est affiché, on interroge WAHA toutes les 5 secondes :
     * l'écran passe tout seul en « Connecté » dès que le téléphone a scanné.
     */
    useEffect(() => {
        if (!needsScan) {
            return;
        }

        const timer = window.setInterval(() => void refresh(), 5000);

        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needsScan]);

    function save(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);

        router.put('/reglages/integrations/whatsapp', form, {
            preserveScroll: true,
            onError: setErrors,
            onSuccess: () => {
                setErrors({});
                setForm((current) => ({ ...current, waha_api_key: '' }));
            },
            onFinish: () => setSaving(false),
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="size-4" />
                    WhatsApp
                </CardTitle>
                <CardDescription>
                    Mode d’essai. WAHA pilote un compte WhatsApp ordinaire en
                    imitant WhatsApp Web — ce que Meta interdit. Pratique pour
                    tester, risqué en boutique : le numéro peut être banni sans
                    préavis. Préférez l’API officielle ci-dessus.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {waha.configured && live ? (
                    <div
                        className={
                            live.connected
                                ? 'flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300'
                                : 'flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300'
                        }
                    >
                        {live.connected ? (
                            <CheckCircle2 className="size-4 shrink-0" />
                        ) : (
                            <TriangleAlert className="size-4 shrink-0" />
                        )}
                        <span className="flex-1">
                            {live.label}
                            {live.detail ? ` — ${live.detail}` : ''}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void refresh()}
                            disabled={checking}
                        >
                            <RefreshCw
                                className={
                                    checking ? 'size-4 animate-spin' : 'size-4'
                                }
                            />
                        </Button>
                    </div>
                ) : (
                    <StatusLine
                        ok={false}
                        okText=""
                        koText="Non configuré. Indiquez l'adresse de votre serveur WAHA."
                    />
                )}

                {qr ? (
                    <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
                        <img
                            src={qr}
                            alt="QR code WhatsApp à scanner"
                            className="size-56 rounded bg-white p-2"
                        />
                        <p className="max-w-xs text-center text-xs text-muted-foreground">
                            Sur le téléphone de la boutique : WhatsApp →
                            Paramètres → Appareils connectés → Connecter un
                            appareil, puis scannez ce code.
                        </p>
                    </div>
                ) : null}

                <form onSubmit={save} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="waha_url">Adresse du serveur</Label>
                            <Input
                                id="waha_url"
                                value={form.waha_url}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        waha_url: event.target.value,
                                    })
                                }
                                placeholder="http://localhost:3000"
                            />
                            <InputError message={errors.waha_url} />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="waha_api_key">
                                Clé d'API (facultatif)
                            </Label>
                            <Input
                                id="waha_api_key"
                                type="password"
                                value={form.waha_api_key}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        waha_api_key: event.target.value,
                                    })
                                }
                                placeholder={
                                    waha.hasApiKey
                                        ? 'Laisser vide pour conserver'
                                        : ''
                                }
                                autoComplete="off"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="waha_session">Session</Label>
                            <Input
                                id="waha_session"
                                value={form.waha_session}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        waha_session: event.target.value,
                                    })
                                }
                                placeholder="default"
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="phone_country_code">
                                Indicatif pays
                            </Label>
                            <Input
                                id="phone_country_code"
                                value={form.phone_country_code}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        phone_country_code:
                                            event.target.value.replace(
                                                /\D/g,
                                                '',
                                            ),
                                    })
                                }
                                className="w-24 tabular-nums"
                            />
                            <InputError message={errors.phone_country_code} />
                            <p className="text-xs text-muted-foreground">
                                Ajouté aux numéros saisis sans indicatif. 221
                                pour le Sénégal.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={saving}>
                            {saving ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Save className="size-4" />
                            )}
                            Enregistrer
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            disabled={!waha.configured}
                            onClick={() =>
                                router.post(
                                    '/reglages/integrations/whatsapp/demarrer',
                                    {},
                                    {
                                        preserveScroll: true,
                                        onSuccess: () => void refresh(),
                                    },
                                )
                            }
                        >
                            <Power className="size-4" />
                            Démarrer la session
                        </Button>

                        {live?.connected ? (
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() =>
                                    router.post(
                                        '/reglages/integrations/whatsapp/arreter',
                                        {},
                                        {
                                            preserveScroll: true,
                                            onSuccess: () => void refresh(),
                                        },
                                    )
                                }
                            >
                                Déconnecter
                            </Button>
                        ) : null}
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

/* -------------------------------------------------------------------------- */

function ImageSearchCard({ settings }: { settings: ImageSearch }) {
    const [key, setKey] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    function save(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);

        router.put(
            '/reglages/integrations',
            { serpapi_key: key },
            {
                preserveScroll: true,
                onError: setErrors,
                onSuccess: () => {
                    setErrors({});
                    setKey('');
                },
                onFinish: () => setSaving(false),
            },
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <ImageIcon className="size-4" />
                    Recherche d'images produit
                </CardTitle>
                <CardDescription>
                    Chercher des photos depuis la fiche produit. Nécessite un
                    compte SerpAPI.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                <StatusLine
                    ok={settings.configured}
                    okText={`Clé enregistrée (${settings.maskedKey})${
                        settings.fromEnvironment
                            ? ' — définie dans le fichier .env'
                            : ''
                    }`}
                    koText="Aucune clé. Le bouton « Rechercher des photos » reste inactif."
                />

                <form onSubmit={save} className="space-y-3">
                    <div className="grid gap-2">
                        <Label htmlFor="serpapi_key">
                            {settings.configured
                                ? 'Remplacer la clé'
                                : 'Clé SerpAPI'}
                        </Label>
                        <Input
                            id="serpapi_key"
                            type="password"
                            value={key}
                            onChange={(event) => setKey(event.target.value)}
                            placeholder={
                                settings.configured
                                    ? 'Laisser vide pour conserver'
                                    : 'Collez votre clé ici'
                            }
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <InputError message={errors.serpapi_key} />
                        <p className="text-xs text-muted-foreground">
                            Créez-la sur{' '}
                            <a
                                href="https://serpapi.com/manage-api-key"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 underline"
                            >
                                serpapi.com
                                <ExternalLink className="size-3" />
                            </a>
                            . Les images trouvées appartiennent à leurs auteurs.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={saving}>
                            {saving ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Save className="size-4" />
                            )}
                            Enregistrer
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            disabled={!settings.configured || testing}
                            onClick={() => {
                                setTesting(true);
                                router.post(
                                    '/reglages/integrations/test',
                                    {},
                                    {
                                        preserveScroll: true,
                                        onFinish: () => setTesting(false),
                                    },
                                );
                            }}
                        >
                            {testing ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            Tester la connexion
                        </Button>

                        {settings.configured && !settings.fromEnvironment ? (
                            <Button
                                type="button"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() =>
                                    router.put(
                                        '/reglages/integrations',
                                        { serpapi_key: '' },
                                        { preserveScroll: true },
                                    )
                                }
                            >
                                Retirer
                            </Button>
                        ) : null}
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

function StatusLine({
    ok,
    okText,
    koText,
}: {
    ok: boolean;
    okText: string;
    koText: string;
}) {
    if (ok) {
        return (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" />
                {okText}
            </p>
        );
    }

    return (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {koText}
        </p>
    );
}

Integrations.layout = {
    breadcrumbs: [
        { title: 'Réglages', href: '/reglages/boutique' },
        { title: 'Intégrations', href: '/reglages/integrations' },
    ],
};
