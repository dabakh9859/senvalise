<?php

namespace App\Http\Controllers;

use App\Enums\DocumentType;
use App\Http\Controllers\Concerns\BuildsSaleCounter;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Services\DocumentService;
use App\Services\SaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Vente au comptoir.
 *
 * La vente n'a pas d'ecran a elle : elle s'ouvre en fenetre depuis la liste
 * des factures et devis, et se referme sur la facture qu'elle vient de
 * produire. Ce controleur ne rend donc aucune page, il ne fait qu'enregistrer.
 */
class PosController extends Controller
{
    use BuildsSaleCounter;

    public function __construct(
        private readonly SaleService $sales,
        private readonly DocumentService $documents,
    ) {}

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
            ->map(fn (ProductVariant $v) => $this->saleCatalogueRow($v))
            ->all();

        return response()->json(['results' => $results]);
    }

    /**
     * Crée un client sans quitter la fenêtre de vente.
     *
     * Un client arrive au comptoir et veut une facture à son nom : l'envoyer
     * sur l'écran « Clients » ferait perdre le panier en cours et ferait
     * attendre tout le monde. Le strict nécessaire suffit ici — nom et
     * téléphone —, la fiche se complète plus tard.
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

            // Une vente vaut facture. La piece est etablie dans la foulee et
            // c'est elle qui s'affiche : au comptoir, ce que le client attend
            // apres avoir paye, c'est un papier a emporter.
            $document = $this->documents->fromSale($sale, DocumentType::Facture);
        } catch (RuntimeException $e) {
            $this->toast($e->getMessage(), 'error');

            return back();
        }

        ActivityLog::record(
            'cree',
            "Vente {$sale->reference} encaissée, facture {$document->reference} générée",
            $document,
        );

        $this->toast("Vente {$sale->reference} enregistrée, facture {$document->reference} générée.");

        return to_route('documents.show', $document);
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
}
