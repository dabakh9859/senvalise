<?php

namespace App\Http\Controllers;

use App\Enums\DocumentStatus;
use App\Enums\DocumentType;
use App\Http\Controllers\Concerns\BuildsSaleCounter;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\Document;
use App\Models\DocumentItem;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\Setting;
use App\Services\DocumentService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * Devis, factures et bons de livraison.
 *
 * C'est aussi l'ecran de vente : le comptoir s'ouvre en fenetre par-dessus
 * cette liste. Vendre et facturer etant le meme geste, les separer obligeait a
 * refaire la saisie une seconde fois pour editer la piece.
 */
class DocumentController extends Controller
{
    use BuildsSaleCounter;

    public function __construct(private readonly DocumentService $documents) {}

    public function index(Request $request): Response
    {
        $query = Document::query()
            ->with(['customer:id,name', 'user:id,name'])
            ->when($request->filled('type'), fn ($q) => $q->ofType($request->string('type')->toString()))
            ->when($request->filled('statut'), fn ($q) => $q->where('status', $request->string('statut')->toString()))
            ->when($request->filled('du'), fn ($q) => $q->whereDate('issue_date', '>=', $request->date('du')))
            ->when($request->filled('au'), fn ($q) => $q->whereDate('issue_date', '<=', $request->date('au')))
            ->when($request->filled('recherche'), function ($q) use ($request) {
                $term = $request->string('recherche')->toString();
                $q->where(function ($sub) use ($term) {
                    $sub->where('reference', 'like', "%{$term}%")
                        ->orWhere('customer_name', 'like', "%{$term}%")
                        ->orWhere('customer_phone', 'like', "%{$term}%");
                });
            });

        $totals = (clone $query)
            ->selectRaw('count(*) as count, coalesce(sum(total), 0) as total, coalesce(sum(amount_paid), 0) as paid')
            ->first();

        $documents = $query->latest('issue_date')
            ->latest('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (Document $document) => [
                'id' => $document->id,
                'type' => $document->type->value,
                'typeLabel' => $document->type->label(),
                'reference' => $document->reference,
                'customer' => $document->customer_name ?? $document->customer?->name,
                'issueDate' => $document->issue_date?->toDateString(),
                'dueDate' => $document->due_date?->toDateString(),
                'validUntil' => $document->valid_until?->toDateString(),
                'total' => $document->total,
                'amountPaid' => $document->amount_paid,
                'balanceDue' => $document->balance_due,
                'status' => $document->status->value,
                'statusLabel' => $document->status->label(),
                'statusTone' => $document->status->tone(),
                'author' => $document->user?->name,
            ]);

        return Inertia::render('documents/index', [
            ...$this->saleCounterProps(),
            'documents' => $documents,
            'filters' => $request->only(['recherche', 'type', 'statut', 'du', 'au']),
            'types' => DocumentType::options(),
            'statuses' => DocumentStatus::options(),
            // Ouvre le comptoir des l'arrivee : c'est ce que fait le bouton
            // « Encaisser une vente » de l'accueil et l'ancienne adresse /vente.
            'openCounter' => $request->boolean('vente'),
            'totals' => [
                'count' => (int) ($totals->count ?? 0),
                'total' => (int) ($totals->total ?? 0),
                'paid' => (int) ($totals->paid ?? 0),
                'due' => (int) (($totals->total ?? 0) - ($totals->paid ?? 0)),
            ],
        ]);
    }

    public function create(Request $request): Response
    {
        return Inertia::render('documents/form', [
            'document' => null,
            'defaultType' => $request->string('type')->toString() ?: DocumentType::Devis->value,
            'types' => DocumentType::options(),
            'customers' => $this->customerOptions(),
            'variants' => $this->variantOptions(),
            'defaults' => [
                'taxRate' => (float) Setting::get('tax_rate', 0),
                'taxLabel' => Setting::get('tax_label', 'TVA'),
                'terms' => Setting::get('invoice_terms'),
                'quoteValidityDays' => (int) Setting::get('quote_validity_days', 15),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateDocument($request);

        $document = $this->documents->create(
            DocumentType::from($validated['type']),
            $validated['attributes'],
            $validated['lines'],
        );

        ActivityLog::record('cree', "{$document->type->label()} {$document->reference} créé", $document);
        $this->toast("{$document->type->label()} {$document->reference} enregistré.");

        return to_route('documents.show', $document);
    }

    public function show(Document $document): Response
    {
        $document->load(['items.variant:id,sku', 'customer', 'user:id,name', 'parent:id,type,reference', 'children:id,type,reference,parent_document_id', 'sale:id,reference']);

        return Inertia::render('documents/show', [
            'document' => $this->present($document),
            'items' => $document->items->map(fn (DocumentItem $item) => [
                'id' => $item->id,
                'designation' => $item->designation,
                'description' => $item->description,
                'sku' => $item->variant?->sku,
                'quantity' => $item->quantity,
                'unitPrice' => $item->unit_price,
                'discount' => $item->discount,
                'lineTotal' => $item->line_total,
            ])->all(),
            'related' => [
                'parent' => $document->parent ? [
                    'id' => $document->parent->id,
                    'reference' => $document->parent->reference,
                    'typeLabel' => $document->parent->type->label(),
                ] : null,
                'children' => $document->children->map(fn (Document $child) => [
                    'id' => $child->id,
                    'reference' => $child->reference,
                    'typeLabel' => $child->type->label(),
                ])->all(),
                'sale' => $document->sale ? [
                    'id' => $document->sale->id,
                    'reference' => $document->sale->reference,
                ] : null,
            ],
            'statuses' => array_map(
                fn (DocumentStatus $s) => ['value' => $s->value, 'label' => $s->label()],
                $document->type->statuses(),
            ),
            'convertTargets' => $this->convertTargets($document),
        ]);
    }

    public function edit(Document $document): Response
    {
        $document->load('items.variant:id,sku');

        return Inertia::render('documents/form', [
            'document' => [
                'id' => $document->id,
                'type' => $document->type->value,
                'reference' => $document->reference,
                'customer_id' => $document->customer_id,
                'customer_name' => $document->customer_name,
                'customer_phone' => $document->customer_phone,
                'customer_address' => $document->customer_address,
                'issue_date' => $document->issue_date?->toDateString(),
                'valid_until' => $document->valid_until?->toDateString(),
                'due_date' => $document->due_date?->toDateString(),
                'delivery_date' => $document->delivery_date?->toDateString(),
                'discount' => $document->discount,
                'tax_rate' => (float) $document->tax_rate,
                'amount_paid' => $document->amount_paid,
                'notes' => $document->notes,
                'terms' => $document->terms,
                'lines' => $document->items->map(fn (DocumentItem $item) => [
                    'product_variant_id' => $item->product_variant_id,
                    'designation' => $item->designation,
                    'description' => $item->description,
                    'quantity' => $item->quantity,
                    'unit_price' => $item->unit_price,
                    'discount' => $item->discount,
                ])->all(),
            ],
            'defaultType' => $document->type->value,
            'types' => DocumentType::options(),
            'customers' => $this->customerOptions(),
            'variants' => $this->variantOptions(),
            'defaults' => [
                'taxRate' => (float) $document->tax_rate,
                'taxLabel' => Setting::get('tax_label', 'TVA'),
                'terms' => $document->terms,
                'quoteValidityDays' => (int) Setting::get('quote_validity_days', 15),
            ],
        ]);
    }

    public function update(Request $request, Document $document): RedirectResponse
    {
        $validated = $this->validateDocument($request, $document);

        $this->documents->update($document, $validated['attributes'], $validated['lines']);

        ActivityLog::record('modifie', "{$document->type->label()} {$document->reference} modifié", $document);
        $this->toast('Document mis à jour.');

        return to_route('documents.show', $document);
    }

    public function destroy(Document $document): RedirectResponse
    {
        $label = "{$document->type->label()} {$document->reference}";
        $document->delete();

        ActivityLog::record('supprime', "{$label} supprimé");
        $this->toast('Document supprimé.');

        return to_route('documents.index');
    }

    public function updateStatus(Request $request, Document $document): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::enum(DocumentStatus::class)],
            'amount_paid' => ['nullable', 'integer', 'min:0'],
        ]);

        $status = DocumentStatus::from($validated['status']);

        $payload = ['status' => $status->value];

        if (array_key_exists('amount_paid', $validated) && $validated['amount_paid'] !== null) {
            $payload['amount_paid'] = min($validated['amount_paid'], $document->total);
        } elseif ($status === DocumentStatus::Paye) {
            $payload['amount_paid'] = $document->total;
        }

        $document->update($payload);

        $this->toast("Statut mis à jour : {$status->label()}.");

        return back();
    }

    public function convert(Request $request, Document $document): RedirectResponse
    {
        $validated = $request->validate([
            'target' => ['required', Rule::enum(DocumentType::class)],
        ]);

        try {
            $created = $this->documents->convert($document, DocumentType::from($validated['target']));
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        ActivityLog::record('conversion', "{$document->reference} → {$created->reference}", $created);
        $this->toast("{$created->type->label()} {$created->reference} créé.");

        return to_route('documents.show', $created);
    }

    /** Facture (ou bon de livraison) éditée depuis une vente encaissée. */
    public function fromSale(Request $request, Sale $sale): RedirectResponse
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in([DocumentType::Facture->value, DocumentType::BonLivraison->value])],
        ]);

        $document = $this->documents->fromSale($sale, DocumentType::from($validated['type']));

        ActivityLog::record('cree', "{$document->type->label()} {$document->reference} édité depuis {$sale->reference}", $document);
        $this->toast("{$document->type->label()} {$document->reference} créé.");

        return to_route('documents.show', $document);
    }

    /** Version imprimable — s'ouvre dans un onglet et lance l'impression. */
    public function print(Document $document): View
    {
        return view('print.document', $this->printData($document));
    }

    /** Téléchargement PDF, pratique pour l'envoi par WhatsApp ou e-mail. */
    public function pdf(Document $document): HttpResponse
    {
        $pdf = Pdf::loadView('print.document', [
            ...$this->printData($document, forPdf: true),
            'isPdf' => true,
        ])->setPaper('a4');

        $this->stampPageNumbers($pdf);

        $name = str($document->reference)->slug()->upper()->value();

        return $pdf->download("{$name}.pdf");
    }

    /**
     * Écrit « Page X / Y » dans le pied, sur toutes les pages.
     *
     * Cela ne peut pas se faire dans le gabarit : dompdf ne connaît le nombre
     * total de pages qu'une fois la mise en page terminée. On rend donc le
     * document à la main, puis on dessine le texte sur le canevas — la
     * position est en points depuis le coin haut gauche d'une A4 (595 x 842),
     * calée sur la bande de pied du gabarit.
     *
     * Une facture d'une seule page n'est pas numérotée : « Page 1 / 1 » est du
     * bruit.
     */
    protected function stampPageNumbers(mixed $pdf): void
    {
        $dompdf = $pdf->getDomPDF();
        $pdf->render();

        $canvas = $dompdf->getCanvas();

        if ($canvas->get_page_count() < 2) {
            return;
        }

        $canvas->page_text(
            x: 282,
            y: 788,
            text: 'Page {PAGE_NUM} / {PAGE_COUNT}',
            font: $dompdf->getFontMetrics()->getFont('DejaVu Sans', 'normal'),
            size: 6,
            color: [0.64, 0.67, 0.71],
        );
    }

    /** @return array<string, mixed> */
    protected function printData(Document $document, bool $forPdf = false): array
    {
        $document->load(['items.variant:id,sku', 'customer', 'user:id,name']);

        return [
            'document' => $document,
            'isPdf' => false,
            'shop' => [
                'name' => Setting::get('shop_name', 'SenValise'),
                'tagline' => Setting::get('shop_tagline'),
                'phone' => Setting::get('shop_phone'),
                'email' => Setting::get('shop_email'),
                'address' => Setting::get('shop_address'),
                'ninea' => Setting::get('shop_ninea'),
                'rc' => Setting::get('shop_rc'),
                'logo' => $this->logoSource($forPdf),
            ],
            'taxLabel' => Setting::get('tax_label', 'TVA'),
        ];
    }

    /**
     * Où lire le logo de l'enseigne.
     *
     * Le navigateur prend l'adresse publique ; dompdf prend le chemin sur le
     * disque. Lui passer une URL l'obligerait à sortir sur le réseau, ce qui
     * est désactivé par défaut et ferait une facture sans logo, sans erreur
     * visible.
     */
    protected function logoSource(bool $forPdf): ?string
    {
        $path = Setting::get(ShopSettingsController::LOGO_KEY);

        if (blank($path)) {
            return null;
        }

        if (! $forPdf) {
            return ShopSettingsController::logoUrl();
        }

        $absolute = Storage::disk('public')->path((string) $path);

        return is_file($absolute) ? $absolute : null;
    }

    /** @return array{type: string, attributes: array<string, mixed>, lines: array<int, array<string, mixed>>} */
    protected function validateDocument(Request $request, ?Document $document = null): array
    {
        $validated = $request->validate([
            'type' => ['required', Rule::enum(DocumentType::class)],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:40'],
            'customer_address' => ['nullable', 'string', 'max:255'],
            'issue_date' => ['required', 'date'],
            'valid_until' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'delivery_date' => ['nullable', 'date'],
            'discount' => ['nullable', 'integer', 'min:0'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'amount_paid' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'terms' => ['nullable', 'string', 'max:2000'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_variant_id' => ['nullable', 'exists:product_variants,id'],
            'lines.*.designation' => ['required', 'string', 'max:255'],
            'lines.*.description' => ['nullable', 'string', 'max:500'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'lines.*.unit_price' => ['required', 'integer', 'min:0'],
            'lines.*.discount' => ['nullable', 'integer', 'min:0'],
        ], [
            'lines.required' => 'Ajoutez au moins une ligne au document.',
        ]);

        // Le type ne change plus après création : la numérotation en dépend.
        $type = $document?->type->value ?? $validated['type'];

        return [
            'type' => $type,
            'attributes' => Arr::except($validated, ['type', 'lines']),
            'lines' => $validated['lines'],
        ];
    }

    /** @return array<string, mixed> */
    protected function present(Document $document): array
    {
        return [
            'id' => $document->id,
            'type' => $document->type->value,
            'typeLabel' => $document->type->label(),
            'reference' => $document->reference,
            'customerId' => $document->customer_id,
            'customerName' => $document->customer_name ?? $document->customer?->displayName(),
            'customerPhone' => $document->customer_phone,
            'customerAddress' => $document->customer_address,
            'issueDate' => $document->issue_date?->toDateString(),
            'validUntil' => $document->valid_until?->toDateString(),
            'dueDate' => $document->due_date?->toDateString(),
            'deliveryDate' => $document->delivery_date?->toDateString(),
            'subtotal' => $document->subtotal,
            'discount' => $document->discount,
            'taxRate' => (float) $document->tax_rate,
            'taxAmount' => $document->tax_amount,
            'taxLabel' => Setting::get('tax_label', 'TVA'),
            'total' => $document->total,
            'amountPaid' => $document->amount_paid,
            'balanceDue' => $document->balance_due,
            'status' => $document->status->value,
            'statusLabel' => $document->status->label(),
            'statusTone' => $document->status->tone(),
            'notes' => $document->notes,
            'terms' => $document->terms,
            'author' => $document->user?->name,
        ];
    }

    /** @return array<int, array{value: string, label: string}> */
    protected function convertTargets(Document $document): array
    {
        $targets = match ($document->type) {
            DocumentType::Devis => [DocumentType::Facture, DocumentType::BonLivraison],
            DocumentType::Facture => [DocumentType::BonLivraison],
            DocumentType::BonLivraison => [DocumentType::Facture],
        };

        return array_map(fn (DocumentType $t) => ['value' => $t->value, 'label' => $t->label()], $targets);
    }

    /** @return array<int, array<string, mixed>> */
    protected function customerOptions(): array
    {
        return Customer::active()
            ->orderBy('name')
            ->limit(500)
            ->get(['id', 'name', 'company_name', 'type', 'phone', 'address'])
            ->map(fn (Customer $c) => [
                'id' => $c->id,
                'name' => $c->displayName(),
                'phone' => $c->phone,
                'address' => $c->address,
            ])
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    protected function variantOptions(): array
    {
        return ProductVariant::query()
            ->with('product:id,name')
            ->active()
            ->orderBy('product_id')
            ->orderBy('position')
            ->get()
            ->map(fn (ProductVariant $v) => [
                'id' => $v->id,
                'label' => $v->fullLabel(),
                'sku' => $v->sku,
                'barcode' => $v->barcode,
                'price' => $v->selling_price,
                'stock' => $v->stock_quantity,
            ])
            ->all();
    }
}
