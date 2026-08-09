<?php

namespace App\Http\Controllers;

use App\Models\ContactMessage;
use App\Models\DeliveryZone;
use App\Models\HomeBlock;
use App\Models\Product;
use App\Services\ImageStorageService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Ce que le gérant règle sur la boutique en ligne : zones de livraison,
 * contenus de la page d'accueil, messages reçus.
 *
 * Le principe est le même que partout ailleurs : une promotion de fin de mois
 * ne peut pas attendre qu'un développeur soit disponible.
 */
class WebSettingsController extends Controller
{
    public function __construct(private readonly ImageStorageService $images) {}

    /*
    |--------------------------------------------------------------------------
    | Zones de livraison
    |--------------------------------------------------------------------------
    */

    public function zones(): Response
    {
        return Inertia::render('reglages/livraison', [
            'zones' => DeliveryZone::withCount('orders')
                ->orderBy('position')
                ->orderBy('name')
                ->get()
                ->map(fn (DeliveryZone $zone) => [
                    'id' => $zone->id,
                    'name' => $zone->name,
                    'city' => $zone->city,
                    'latitude' => $zone->latitude,
                    'longitude' => $zone->longitude,
                    'radiusKm' => $zone->radius_km,
                    'isMapped' => $zone->isMapped(),
                    'fee' => $zone->fee,
                    'delayDays' => $zone->delay_days,
                    'note' => $zone->note,
                    'position' => $zone->position,
                    'isActive' => $zone->is_active,
                    'ordersCount' => (int) $zone->orders_count,
                ])
                ->all(),
        ]);
    }

    public function storeZone(Request $request): RedirectResponse
    {
        DeliveryZone::create($this->validatedZone($request));
        $this->toast('Zone de livraison ajoutée.');

        return back();
    }

    public function updateZone(Request $request, DeliveryZone $zone): RedirectResponse
    {
        $zone->update($this->validatedZone($request));
        $this->toast('Zone mise à jour.');

        return back();
    }

    public function destroyZone(DeliveryZone $zone): RedirectResponse
    {
        // Une zone qui a servi est désactivée, pas supprimée : les commandes
        // passées doivent garder leur zone d'origine.
        if ($zone->orders()->exists()) {
            $zone->update(['is_active' => false]);
            $this->toast('Zone désactivée (des commandes y sont rattachées).');

            return back();
        }

        $zone->delete();
        $this->toast('Zone supprimée.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Page d'accueil
    |--------------------------------------------------------------------------
    */

    public function home(): Response
    {
        return Inertia::render('reglages/accueil-boutique', [
            'blocks' => HomeBlock::with('product:id,name')
                ->orderBy('type')
                ->orderBy('position')
                ->get()
                ->map(fn (HomeBlock $block) => [
                    'id' => $block->id,
                    'type' => $block->type,
                    'typeLabel' => $block->typeLabel(),
                    'title' => $block->title,
                    'subtitle' => $block->subtitle,
                    'body' => $block->body,
                    'image' => $block->imageUrl(),
                    'videoUrl' => $block->video_url,
                    'linkUrl' => $block->link_url,
                    'linkLabel' => $block->link_label,
                    'productId' => $block->product_id,
                    'productName' => $block->product?->name,
                    'position' => $block->position,
                    'isActive' => $block->is_active,
                    'startsAt' => $block->starts_at?->toDateString(),
                    'endsAt' => $block->ends_at?->toDateString(),
                ])
                ->all(),
            'types' => [
                ['value' => 'banniere', 'label' => 'Bannière', 'description' => 'Grande image en haut de l’accueil.'],
                ['value' => 'video', 'label' => 'Vidéo', 'description' => 'Publicité vidéo (YouTube, Vimeo ou fichier).'],
                ['value' => 'promo', 'label' => 'Promotion', 'description' => 'Met un produit en avant.'],
                ['value' => 'argument', 'label' => 'Argument', 'description' => 'Livraison, garantie, paiement…'],
            ],
            'products' => Product::where('is_published', true)
                ->orderBy('name')
                ->get(['id', 'name'])
                ->all(),
        ]);
    }

    public function storeBlock(Request $request): RedirectResponse
    {
        $data = $this->validatedBlock($request);
        HomeBlock::create($data);

        $this->toast('Bloc ajouté à la page d’accueil.');

        return back();
    }

    public function updateBlock(Request $request, HomeBlock $block): RedirectResponse
    {
        $data = $this->validatedBlock($request, $block);
        $block->update($data);

        $this->toast('Bloc mis à jour.');

        return back();
    }

    public function destroyBlock(HomeBlock $block): RedirectResponse
    {
        if (filled($block->image_path)) {
            Storage::disk('public')->delete((string) $block->image_path);
        }

        $block->delete();
        $this->toast('Bloc retiré.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Messages de contact
    |--------------------------------------------------------------------------
    */

    public function contacts(Request $request): Response
    {
        $query = ContactMessage::query()
            ->with(['customer:id,name,company_name,type', 'responder:id,name'])
            ->search($request->string('recherche')->toString())
            ->when($request->filled('statut'), fn ($q) => $q->where('status', $request->string('statut')->toString()));

        $counts = (clone $query)
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->toBase()
            ->pluck('total', 'status');

        return Inertia::render('contacts/index', [
            'messages' => $query->latest('id')
                ->paginate(25)
                ->withQueryString()
                ->through(fn (ContactMessage $message) => [
                    'id' => $message->id,
                    'name' => $message->name,
                    'phone' => $message->phone,
                    'email' => $message->email,
                    'subject' => $message->subject,
                    'body' => $message->body,
                    'status' => $message->status,
                    'statusLabel' => $message->statusLabel(),
                    'statusTone' => $message->statusTone(),
                    'answer' => $message->answer,
                    'responder' => $message->responder?->name,
                    'customerId' => $message->customer_id,
                    'customerName' => $message->customer?->displayName(),
                    'createdAt' => $message->created_at?->toIso8601String(),
                    'answeredAt' => $message->answered_at?->toIso8601String(),
                ]),
            'filters' => $request->only(['recherche', 'statut']),
            'statuses' => [
                ['value' => 'nouveau', 'label' => 'Nouveaux'],
                ['value' => 'lu', 'label' => 'Lus'],
                ['value' => 'traite', 'label' => 'Traités'],
            ],
            'totals' => [
                'new' => (int) ($counts['nouveau'] ?? 0),
                'read' => (int) ($counts['lu'] ?? 0),
                'done' => (int) ($counts['traite'] ?? 0),
            ],
        ]);
    }

    public function answerContact(Request $request, ContactMessage $message): RedirectResponse
    {
        $validated = $request->validate([
            'answer' => ['nullable', 'string', 'max:3000'],
            'status' => ['required', 'in:nouveau,lu,traite'],
        ]);

        $message->update([
            'answer' => $validated['answer'] ?? $message->answer,
            'status' => $validated['status'],
            'answered_by' => filled($validated['answer'] ?? null) ? Auth::id() : $message->answered_by,
            'answered_at' => filled($validated['answer'] ?? null) ? now() : $message->answered_at,
        ]);

        $this->toast('Message mis à jour.');

        return back();
    }

    public function destroyContact(ContactMessage $message): RedirectResponse
    {
        $message->delete();
        $this->toast('Message supprimé.');

        return back();
    }

    /*
    |--------------------------------------------------------------------------
    | Validation
    |--------------------------------------------------------------------------
    */

    /** @return array<string, mixed> */
    protected function validatedZone(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'city' => ['nullable', 'string', 'max:120'],
            // Centre de la zone : sert à proposer automatiquement la bonne au
            // client qui accepte d'être localisé.
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'radius_km' => ['nullable', 'integer', 'min:1', 'max:500'],
            'fee' => ['required', 'integer', 'min:0'],
            'delay_days' => ['required', 'integer', 'min:0', 'max:60'],
            'note' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'integer', 'min:0', 'max:999'],
            'is_active' => ['boolean'],
        ]);
    }

    /** @return array<string, mixed> */
    protected function validatedBlock(Request $request, ?HomeBlock $block = null): array
    {
        $validated = $request->validate([
            'type' => ['required', 'in:banniere,video,promo,argument'],
            'title' => ['nullable', 'string', 'max:180'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'body' => ['nullable', 'string', 'max:2000'],
            'image' => ['nullable', 'image', 'max:8192'],
            'video_url' => ['nullable', 'url:http,https', 'max:500'],
            'link_url' => ['nullable', 'string', 'max:500'],
            'link_label' => ['nullable', 'string', 'max:80'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'position' => ['nullable', 'integer', 'min:0', 'max:999'],
            'is_active' => ['boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
        ]);

        // Les bannières arrivent d'un téléphone : plusieurs méga-octets. Elles
        // passent par le même redimensionnement que les photos de produit.
        if ($request->hasFile('image')) {
            if ($block && filled($block->image_path)) {
                Storage::disk('public')->delete((string) $block->image_path);
            }

            $validated['image_path'] = $this->images->store($request->file('image'), 'accueil');
        }

        unset($validated['image']);

        return $validated;
    }
}
