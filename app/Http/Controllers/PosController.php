<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Models\Category;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Models\Setting;
use App\Services\SaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * Caisse boutique.
 *
 * Le catalogue vendable est envoyé en entier au navigateur au chargement :
 * la recherche et le scan sont alors instantanés, sans aller-retour serveur.
 * C'est ce qui compte devant un client au comptoir.
 */
class PosController extends Controller
{
    public function __construct(private readonly SaleService $sales) {}

    public function index(): Response
    {
        return Inertia::render('caisse/index', [
            'catalogue' => $this->catalogue(),
            'categories' => Category::active()->orderBy('position')->get(['id', 'name']),
            /*
             * Client tout juste créé depuis la caisse. Il transite par la
             * session plutôt que par le flash Inertia : le flash arrive dans
             * un évènement, pas dans les props, et c'est bien d'une prop dont
             * l'écran a besoin pour se présélectionner.
             */
            'nouveauClientId' => session('nouveauClient'),
            'customers' => Customer::active()->orderBy('name')->limit(500)->get(['id', 'name', 'phone'])
                ->map(fn (Customer $c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'phone' => $c->phone,
                ]),
            'paymentMethods' => PaymentMethod::options(),
            'allowNegativeStock' => (bool) Setting::get('allow_negative_stock', false),
        ]);
    }

    /**
     * Recherche serveur — filet de sécurité si un article vient d'être créé
     * ailleurs et n'est pas dans le catalogue déjà chargé.
     */
    public function search(Request $request): JsonResponse
    {
        $term = $request->string('q')->toString();

        if (strlen($term) < 2) {
            return response()->json(['results' => []]);
        }

        $results = ProductVariant::query()
            ->with('product:id,name')
            ->active()
            ->search($term)
            ->limit(20)
            ->get()
            ->map(fn (ProductVariant $v) => $this->toCatalogueRow($v))
            ->all();

        return response()->json(['results' => $results]);
    }

    /**
     * Crée un client sans quitter la caisse.
     *
     * Un client arrive au comptoir et veut une facture : l'envoyer sur l'écran
     * « Clients » ferait perdre le panier en cours et ferait attendre tout le
     * monde. Le strict nécessaire suffit ici — nom et téléphone —, la fiche se
     * complète plus tard.
     */
    public function storeCustomer(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:180'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:180'],
            'city' => ['nullable', 'string', 'max:120'],
        ], [
            'name.required' => 'Le nom du client est obligatoire.',
        ]);

        // Un même numéro saisi deux fois crée un doublon que quelqu'un devra
        // fusionner plus tard : autant reconnaître la fiche tout de suite.
        $existing = $this->findByPhone($validated['phone'] ?? null);

        if ($existing) {
            $this->toast("« {$existing->displayName()} » existe déjà : la fiche a été sélectionnée.");

            return back()->with('nouveauClient', $existing->id);
        }

        $customer = Customer::create([
            ...$validated,
            'type' => 'particulier',
            'is_active' => true,
        ]);

        $this->toast('Client créé et rattaché à la vente.');

        return back()->with('nouveauClient', $customer->id);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_variant_id' => ['required', 'exists:product_variants,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'lines.*.unit_price' => ['required', 'integer', 'min:0'],
            'lines.*.discount' => ['nullable', 'integer', 'min:0'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'discount' => ['nullable', 'integer', 'min:0'],
            'amount_paid' => ['nullable', 'integer', 'min:0'],
            'payment_method' => ['required', 'string'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        try {
            $sale = $this->sales->create($validated['lines'], [
                'customer_id' => $validated['customer_id'] ?? null,
                'discount' => $validated['discount'] ?? 0,
                'amount_paid' => $validated['amount_paid'] ?? null,
                'payment_method' => $validated['payment_method'],
                'note' => $validated['note'] ?? null,
            ]);
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        $this->toast("Vente {$sale->reference} enregistrée.");

        return to_route('sales.show', $sale);
    }

    /**
     * Retrouve un client par son numéro, comparé sur ses neuf derniers
     * chiffres : « 77 885 83 74 » et « +221778858374 » sont la même personne.
     */
    protected function findByPhone(?string $phone): ?Customer
    {
        $digits = (string) preg_replace('/\D/', '', (string) $phone);
        $tail = mb_substr($digits, -9);

        if ($tail === '') {
            return null;
        }

        return Customer::query()
            ->whereNotNull('phone')
            ->get()
            ->first(function (Customer $customer) use ($tail): bool {
                $stored = (string) preg_replace('/\D/', '', (string) $customer->phone);

                return $stored !== '' && str_ends_with($stored, $tail);
            });
    }

    /** @return array<int, array<string, mixed>> */
    protected function catalogue(): array
    {
        return ProductVariant::query()
            ->with('product:id,name,category_id,is_active')
            ->active()
            ->whereHas('product', fn ($p) => $p->where('is_active', true))
            ->orderBy('product_id')
            ->orderBy('position')
            ->get()
            ->map(fn (ProductVariant $v) => $this->toCatalogueRow($v))
            ->all();
    }

    /** @return array<string, mixed> */
    protected function toCatalogueRow(ProductVariant $variant): array
    {
        return [
            'id' => $variant->id,
            'label' => $variant->fullLabel(),
            'productName' => $variant->product?->name,
            'variantLabel' => $variant->variant_label,
            'sku' => $variant->sku,
            'barcode' => $variant->barcode,
            'price' => $variant->selling_price,
            'stock' => $variant->stock_quantity,
            'categoryId' => $variant->product?->category_id,
        ];
    }
}
