<?php

namespace App\Http\Controllers;

use App\Enums\DocumentStatus;
use App\Enums\DocumentType;
use App\Enums\MessageChannel;
use App\Enums\MessageStatus;
use App\Enums\MessageType;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Message;
use App\Models\MessageTemplate;
use App\Services\Messaging\MailSettings;
use App\Services\Messaging\MessageComposer;
use App\Services\Messaging\MessageService;
use App\Services\Messaging\WhatsAppGateway;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class MessageController extends Controller
{
    public function __construct(
        private readonly MessageService $messages,
        private readonly MessageComposer $composer,
        private readonly MailSettings $mail,
        private readonly WhatsAppGateway $whatsapp,
    ) {}

    /** Historique des envois, avec recherche et filtres. */
    public function index(Request $request): Response
    {
        $query = Message::query()
            ->with(['customer:id,name', 'user:id,name'])
            ->search($request->string('recherche')->toString())
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')->toString()))
            ->when($request->filled('canal'), fn ($q) => $q->where('channel', $request->string('canal')->toString()))
            ->when($request->filled('statut'), fn ($q) => $q->where('status', $request->string('statut')->toString()))
            ->when($request->filled('du'), fn ($q) => $q->whereDate('created_at', '>=', $request->date('du')))
            ->when($request->filled('au'), fn ($q) => $q->whereDate('created_at', '<=', $request->date('au')));

        $counts = (clone $query)
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->toBase()
            ->pluck('total', 'status');

        $messages = $query->latest('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (Message $message) => [
                'id' => $message->id,
                'type' => $message->type->value,
                'typeLabel' => $message->type->label(),
                'channel' => $message->channel->value,
                'channelLabel' => $message->channel->label(),
                'recipient' => $message->recipient,
                'recipientName' => $message->recipient_name,
                'customerId' => $message->customer_id,
                'subject' => $message->subject,
                'body' => $message->body,
                'status' => $message->status->value,
                'statusLabel' => $message->status->label(),
                'statusTone' => $message->status->tone(),
                'error' => $message->error,
                'batchLabel' => $message->batch_label,
                'sentAt' => $message->sent_at?->toIso8601String(),
                'createdAt' => $message->created_at?->toIso8601String(),
                'author' => $message->user?->name,
            ]);

        return Inertia::render('messages/index', [
            'messages' => $messages,
            'filters' => $request->only(['recherche', 'type', 'canal', 'statut', 'du', 'au']),
            'types' => MessageType::options(),
            'channels' => MessageChannel::options(),
            'statuses' => MessageStatus::options(),
            'totals' => [
                'sent' => (int) ($counts[MessageStatus::Envoye->value] ?? 0),
                'pending' => (int) ($counts[MessageStatus::EnAttente->value] ?? 0),
                'failed' => (int) ($counts[MessageStatus::Echec->value] ?? 0),
            ],
            'channelsReady' => $this->channelsReady(),
        ]);
    }

    /** Écran de composition : destinataires, modèle, texte. */
    public function create(Request $request): Response
    {
        return Inertia::render('messages/composer', [
            'templates' => MessageTemplate::active()
                ->orderBy('name')
                ->get()
                ->map(fn (MessageTemplate $template) => [
                    'id' => $template->id,
                    'name' => $template->name,
                    'type' => $template->type->value,
                    'channel' => $template->channel->value,
                    'subject' => $template->subject,
                    'body' => $template->body,
                ]),
            'customers' => $this->customerOptions(),
            'unpaid' => $this->unpaidInvoices(),
            'types' => MessageType::options(),
            'channels' => MessageChannel::options(),
            'variables' => MessageComposer::variables(),
            'channelsReady' => $this->channelsReady(),
            'defaultTemplate' => $request->integer('modele') ?: null,
            // Modeles approuves par Meta : sans eux, impossible d'ecrire a un
            // client qui n'a pas repondu dans les 24 dernieres heures.
            'whatsappDriver' => $this->whatsapp->driver(),
            'whatsappTemplates' => $this->whatsapp->usesCloud()
                ? array_values(array_filter(
                    $this->whatsapp->cloud()->templates(),
                    fn (array $template): bool => $template['status'] === 'APPROVED',
                ))
                : [],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'type' => ['required', Rule::enum(MessageType::class)],
            'channel' => ['required', Rule::enum(MessageChannel::class)],
            'subject' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:5000'],
            'label' => ['nullable', 'string', 'max:120'],
            'message_template_id' => ['nullable', 'exists:message_templates,id'],
            // Modele approuve par Meta, obligatoire hors fenetre de 24 h.
            'whatsapp_template' => ['nullable', 'string', 'max:512'],
            'whatsapp_language' => ['nullable', 'string', 'max:10'],
            'customer_ids' => ['required', 'array', 'min:1'],
            'customer_ids.*' => ['integer', 'exists:customers,id'],
            'document_ids' => ['nullable', 'array'],
        ], [
            'customer_ids.required' => 'Choisissez au moins un destinataire.',
        ]);

        $channel = MessageChannel::from($validated['channel']);

        if (! $this->channelsReady()[$channel->value]) {
            $this->toast(
                $channel === MessageChannel::Email
                    ? "L'envoi d'e-mails n'est pas configuré."
                    : "WhatsApp n'est pas connecté.",
                'error',
            );

            return back();
        }

        $customers = Customer::whereIn('id', $validated['customer_ids'])->get();

        $result = $this->messages->queue(
            type: MessageType::from($validated['type']),
            channel: $channel,
            body: $validated['body'],
            subject: $validated['subject'] ?? null,
            customers: $customers->all(),
            template: isset($validated['message_template_id'])
                ? MessageTemplate::whereKey((int) $validated['message_template_id'])->first()
                : null,
            label: $validated['label'] ?? null,
            documentIds: array_map('intval', $validated['document_ids'] ?? []),
            whatsappTemplate: $validated['whatsapp_template'] ?? null,
            whatsappLanguage: $validated['whatsapp_language'] ?? 'fr',
        );

        $this->reportQueue($result);

        return to_route('messages.index');
    }

    public function retry(Message $message): RedirectResponse
    {
        $this->messages->retry($message);
        $this->toast('Message remis en file d’envoi.');

        return back();
    }

    public function destroy(Message $message): RedirectResponse
    {
        $message->delete();
        $this->toast('Message retiré de l’historique.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Modèles de message
    |--------------------------------------------------------------------------
    */

    public function templates(): Response
    {
        return Inertia::render('messages/modeles', [
            'templates' => MessageTemplate::withCount('messages')
                ->orderBy('name')
                ->get()
                ->map(fn (MessageTemplate $template) => [
                    'id' => $template->id,
                    'name' => $template->name,
                    'type' => $template->type->value,
                    'typeLabel' => $template->type->label(),
                    'channel' => $template->channel->value,
                    'channelLabel' => $template->channel->label(),
                    'subject' => $template->subject,
                    'body' => $template->body,
                    'isActive' => $template->is_active,
                    'usageCount' => (int) $template->messages_count,
                ]),
            'types' => MessageType::options(),
            'channels' => MessageChannel::options(),
            'variables' => MessageComposer::variables(),
        ]);
    }

    public function storeTemplate(Request $request): RedirectResponse
    {
        MessageTemplate::create($this->validatedTemplate($request));
        $this->toast('Modèle enregistré.');

        return back();
    }

    public function updateTemplate(Request $request, MessageTemplate $template): RedirectResponse
    {
        $template->update($this->validatedTemplate($request));
        $this->toast('Modèle mis à jour.');

        return back();
    }

    public function destroyTemplate(MessageTemplate $template): RedirectResponse
    {
        $template->delete();
        $this->toast('Modèle supprimé.');

        return back();
    }

    /** Aperçu du texte avec des valeurs d'exemple. */
    public function preview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'body' => ['nullable', 'string', 'max:5000'],
            'subject' => ['nullable', 'string', 'max:255'],
        ]);

        return response()->json([
            'subject' => $this->composer->preview($validated['subject'] ?? ''),
            'body' => $this->composer->preview($validated['body'] ?? ''),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Assistants
    |--------------------------------------------------------------------------
    */

    /** @return array<string, bool> */
    protected function channelsReady(): array
    {
        return [
            MessageChannel::Email->value => $this->mail->isConfigured(),
            MessageChannel::Whatsapp->value => $this->whatsapp->usesCloud()
                ? $this->whatsapp->cloud()->isConfigured()
                : $this->whatsapp->waha()->status()['connected'],
        ];
    }

    /** @return array<string, mixed> */
    protected function validatedTemplate(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::enum(MessageType::class)],
            'channel' => ['required', Rule::enum(MessageChannel::class)],
            'subject' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:5000'],
            'is_active' => ['boolean'],
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    protected function customerOptions(): array
    {
        return Customer::active()
            ->orderBy('name')
            ->get([
                'id', 'name', 'company_name', 'type', 'phone', 'email',
                'whatsapp_opt_in_at', 'whatsapp_opt_out_at', 'whatsapp_last_inbound_at',
            ])
            ->map(fn (Customer $customer) => [
                'id' => $customer->id,
                'name' => $customer->displayName(),
                'phone' => $customer->phone,
                'email' => $customer->email,
                'whatsappOptIn' => $customer->acceptsWhatsapp(),
                'whatsappWindowOpen' => $this->whatsapp->windowIsOpen($customer),
            ])
            ->all();
    }

    /**
     * Clients ayant une facture non soldée : la cible naturelle d'un rappel.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function unpaidInvoices(): array
    {
        return Document::query()
            ->with('customer:id,name,company_name,type,phone,email')
            ->ofType(DocumentType::Facture)
            ->whereNotNull('customer_id')
            ->whereNotIn('status', [DocumentStatus::Paye->value, DocumentStatus::Annule->value])
            ->whereColumn('amount_paid', '<', 'total')
            ->orderBy('due_date')
            ->get()
            ->filter(fn (Document $document) => $document->customer !== null)
            ->map(fn (Document $document) => [
                'documentId' => $document->id,
                'reference' => $document->reference,
                'customerId' => $document->customer_id,
                'customerName' => $document->customer?->displayName(),
                'phone' => $document->customer?->phone,
                'email' => $document->customer?->email,
                'balanceDue' => $document->balance_due,
                'balanceLabel' => Money::format($document->balance_due),
                'dueDate' => $document->due_date?->toDateString(),
                'overdue' => $document->due_date?->isPast() ?? false,
            ])
            ->values()
            ->all();
    }

    /** @param  array{queued: int, skipped: array<int, string>}  $result */
    protected function reportQueue(array $result): void
    {
        if ($result['queued'] === 0) {
            $this->toast(
                'Aucun message envoyé : '.($result['skipped'][0] ?? 'destinataires sans coordonnées.'),
                'error',
            );

            return;
        }

        $message = "{$result['queued']} message(s) en cours d'envoi.";

        if ($result['skipped'] !== []) {
            $this->toast(
                $message.' '.count($result['skipped']).' ignoré(s) : '.$result['skipped'][0],
                'warning',
            );

            return;
        }

        $this->toast($message);
    }
}
