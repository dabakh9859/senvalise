<?php

use App\Http\Controllers\ArrivalController;
use App\Http\Controllers\BrandController;
use App\Http\Controllers\CashMovementController;
use App\Http\Controllers\CashSessionController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\DuplicateController;
use App\Http\Controllers\ImageSearchController;
use App\Http\Controllers\IntegrationSettingsController;
use App\Http\Controllers\LabelController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\PosController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ReturnController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\ShopSettingsController;
use App\Http\Controllers\StockController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VaultController;
use App\Http\Controllers\WebSettingsController;
use App\Http\Controllers\WhatsAppWebhookController;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => Auth::check()
    ? redirect()->route('dashboard')
    : redirect()->route('boutique.accueil'))->name('home');

/*
|--------------------------------------------------------------------------
| Webhook WhatsApp
|--------------------------------------------------------------------------
| Appelé par Meta, jamais par un navigateur : ni session, ni jeton CSRF.
| L'authenticité de chaque appel est prouvée par sa signature HMAC.
*/
Route::get('webhooks/whatsapp', [WhatsAppWebhookController::class, 'verify'])
    ->name('webhooks.whatsapp.verify');
Route::post('webhooks/whatsapp', [WhatsAppWebhookController::class, 'handle'])
    ->name('webhooks.whatsapp');

Route::middleware(['auth:web', 'verified'])->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');

    /*
    |--------------------------------------------------------------------------
    | Le quotidien — gérant et vendeur
    |--------------------------------------------------------------------------
    */
    /*
    | « Caisse » plus bas est le tiroir-caisse : ouverture, achats de la
    | journee, fermeture. A ne pas confondre avec la vente elle-meme, qui vit
    | desormais dans la fenetre ouverte depuis « Factures & devis ».
    */
    // La vente n'a plus d'ecran a elle : elle s'ouvre en fenetre au-dessus des
    // factures et devis. L'ancienne adresse mene donc a cette liste, comptoir
    // deja ouvert, pour que les liens et les habitudes continuent de marcher.
    Route::redirect('vente', '/documents?vente=1')->name('pos.index');
    Route::get('vente/recherche', [PosController::class, 'search'])->name('pos.search');
    Route::post('vente/enregistrer', [PosController::class, 'store'])->name('pos.store');
    // Créer un client sans quitter l'écran de vente : en sortir ferait perdre
    // le panier en cours et attendre tout le monde.
    Route::post('vente/client', [PosController::class, 'storeCustomer'])->name('pos.customer');

    /*
    |--------------------------------------------------------------------------
    | Caisse : ouverture, achats du jour, fermeture
    |--------------------------------------------------------------------------
    | Ouverte aux deux roles. C'est le vendeur qui tient le tiroir, donc c'est
    | lui qui l'ouvre le matin et le compte le soir ; supprimer un mouvement
    | reste au gerant, parce que cela deplace l'ecart d'une caisse deja fermee.
    */
    Route::get('caisse', [CashSessionController::class, 'index'])->name('cash.index');
    Route::post('caisse/ouvrir', [CashSessionController::class, 'open'])->name('cash.open');
    Route::post('caisse/{session}/fermer', [CashSessionController::class, 'close'])->name('cash.close');
    Route::get('caisse/{session}', [CashSessionController::class, 'show'])->name('cash.show');

    Route::get('achats', [CashMovementController::class, 'index'])->name('cash-movements.index');
    Route::post('achats', [CashMovementController::class, 'store'])->name('cash-movements.store');
    Route::delete('achats/{movement}', [CashMovementController::class, 'destroy'])
        ->middleware('gerant')->name('cash-movements.destroy');

    /*
    |--------------------------------------------------------------------------
    | Retours client
    |--------------------------------------------------------------------------
    | « nouveau » et « recherche-vente » passent avant {return}, sinon le mot
    | serait pris pour un identifiant.
    */
    Route::get('retours', [ReturnController::class, 'index'])->name('returns.index');
    Route::get('retours/nouveau', [ReturnController::class, 'create'])->name('returns.create');
    Route::get('retours/recherche-vente', [ReturnController::class, 'lookup'])->name('returns.lookup');
    Route::post('retours', [ReturnController::class, 'store'])->name('returns.store');
    Route::get('retours/{return}', [ReturnController::class, 'show'])->name('returns.show');
    Route::post('retours/{return}/avoir-utilise', [ReturnController::class, 'consume'])->name('returns.consume');

    /*
    |--------------------------------------------------------------------------
    | Boutique en ligne — gerant uniquement
    |--------------------------------------------------------------------------
    | Commandes et coffres engagent l'argent du client sur la duree : un
    | versement encaisse ou une commande avancee a tort se rattrape mal. Le
    | vendeur tient le comptoir, le gerant tient la boutique en ligne.
    */
    Route::middleware('gerant')->group(function () {
        Route::get('commandes', [OrderController::class, 'index'])->name('orders.index');
        Route::get('commandes/{order}', [OrderController::class, 'show'])->name('orders.show');
        Route::post('commandes/{order}/etape', [OrderController::class, 'advance'])->name('orders.advance');
        Route::post('commandes/{order}/annuler', [OrderController::class, 'cancel'])->name('orders.cancel');

        Route::get('coffres', [VaultController::class, 'index'])->name('vaults.index');
        Route::get('coffres/{vault}', [VaultController::class, 'show'])->name('vaults.show');
        Route::post('coffres', [VaultController::class, 'store'])->name('vaults.store');
        Route::post('coffres/{vault}/versement', [VaultController::class, 'deposit'])->name('vaults.deposit');
        Route::post('coffres/{vault}/rembourser', [VaultController::class, 'refund'])->name('vaults.refund');
    });

    Route::get('ventes', [SaleController::class, 'index'])->name('sales.index');
    Route::get('ventes/{sale}', [SaleController::class, 'show'])->name('sales.show');
    Route::get('ventes/{sale}/ticket', [SaleController::class, 'receipt'])->name('sales.receipt');
    Route::post('ventes/{sale}/annuler', [SaleController::class, 'cancel'])
        ->middleware('gerant')->name('sales.cancel');
    Route::post('ventes/{sale}/document', [DocumentController::class, 'fromSale'])->name('sales.document');

    /*
    |--------------------------------------------------------------------------
    | Catalogue
    |--------------------------------------------------------------------------
    | « produits/nouveau » passe avant « produits/{product} », sinon le mot
    | serait pris pour un identifiant.
    */
    Route::get('produits', [ProductController::class, 'index'])->name('products.index');
    // Relais de recherche d'images : limité pour ne pas brûler le quota SerpAPI.
    Route::get('produits/recherche-images', ImageSearchController::class)
        ->middleware(['gerant', 'throttle:20,1'])->name('products.image-search');
    Route::get('produits/nouveau', [ProductController::class, 'create'])
        ->middleware('gerant')->name('products.create');
    Route::post('produits', [ProductController::class, 'store'])
        ->middleware('gerant')->name('products.store');
    Route::get('produits/{product}', [ProductController::class, 'show'])->name('products.show');
    Route::get('produits/{product}/modifier', [ProductController::class, 'edit'])
        ->middleware('gerant')->name('products.edit');
    Route::put('produits/{product}', [ProductController::class, 'update'])
        ->middleware('gerant')->name('products.update');
    Route::delete('produits/{product}', [ProductController::class, 'destroy'])
        ->middleware('gerant')->name('products.destroy');
    Route::post('produits/{product}/publication', [ProductController::class, 'togglePublication'])
        ->middleware('gerant')->name('products.publication');

    // Le catalogue porte desormais les quantites : « Stock » et « Produits »
    // etaient deux lectures de la meme marchandise, et corriger une quantite
    // obligeait a changer d'ecran pour retrouver le produit.
    Route::redirect('stock', '/produits')->name('stock.index');
    Route::get('stock/mouvements', [StockController::class, 'movements'])->name('stock.movements');
    Route::get('stock/inventaire', [StockController::class, 'inventory'])
        ->middleware('gerant')->name('stock.inventory');
    Route::post('stock/inventaire', [StockController::class, 'storeInventory'])
        ->middleware('gerant')->name('stock.inventory.store');
    Route::post('stock/ajustement', [StockController::class, 'adjust'])
        ->middleware('gerant')->name('stock.adjust');

    Route::get('etiquettes', [LabelController::class, 'index'])->name('labels.index');
    Route::get('etiquettes/planche', [LabelController::class, 'sheet'])->name('labels.sheet');

    /*
    |--------------------------------------------------------------------------
    | Clients, factures, devis et bons de livraison
    |--------------------------------------------------------------------------
    */
    Route::resource('clients', CustomerController::class)
        ->parameters(['clients' => 'customer'])
        ->names('customers')
        ->only(['index', 'show', 'store', 'update', 'destroy']);

    Route::get('documents', [DocumentController::class, 'index'])->name('documents.index');
    Route::get('documents/nouveau', [DocumentController::class, 'create'])->name('documents.create');
    Route::post('documents', [DocumentController::class, 'store'])->name('documents.store');
    Route::get('documents/{document}', [DocumentController::class, 'show'])->name('documents.show');
    Route::get('documents/{document}/modifier', [DocumentController::class, 'edit'])->name('documents.edit');
    Route::put('documents/{document}', [DocumentController::class, 'update'])->name('documents.update');
    Route::delete('documents/{document}', [DocumentController::class, 'destroy'])->name('documents.destroy');
    Route::get('documents/{document}/pdf', [DocumentController::class, 'pdf'])->name('documents.pdf');
    Route::get('documents/{document}/impression', [DocumentController::class, 'print'])->name('documents.print');
    Route::post('documents/{document}/convertir', [DocumentController::class, 'convert'])->name('documents.convert');
    Route::post('documents/{document}/statut', [DocumentController::class, 'updateStatus'])->name('documents.status');

    /*
    |--------------------------------------------------------------------------
    | Réservé au gérant
    |--------------------------------------------------------------------------
    */
    Route::middleware('gerant')->group(function () {
        Route::get('arrivages', [ArrivalController::class, 'index'])->name('arrivals.index');
        Route::get('arrivages/nouveau', [ArrivalController::class, 'create'])->name('arrivals.create');
        Route::post('arrivages', [ArrivalController::class, 'store'])->name('arrivals.store');
        Route::get('arrivages/{arrival}', [ArrivalController::class, 'show'])->name('arrivals.show');
        Route::get('arrivages/{arrival}/modifier', [ArrivalController::class, 'edit'])->name('arrivals.edit');
        Route::put('arrivages/{arrival}', [ArrivalController::class, 'update'])->name('arrivals.update');
        Route::delete('arrivages/{arrival}', [ArrivalController::class, 'destroy'])->name('arrivals.destroy');
        Route::post('arrivages/{arrival}/receptionner', [ArrivalController::class, 'receive'])->name('arrivals.receive');

        Route::get('rapports', [ReportController::class, 'index'])->name('reports.index');
        Route::get('rapports/export', [ReportController::class, 'export'])->name('reports.export');

        /*
        |--------------------------------------------------------------------------
        | Messages aux clients
        |--------------------------------------------------------------------------
        | Réservé au gérant : c'est la boutique qui s'adresse à ses clients.
        | « nouveau » et « modeles » passent avant {message}.
        */
        Route::get('messages', [MessageController::class, 'index'])->name('messages.index');
        Route::get('messages/nouveau', [MessageController::class, 'create'])->name('messages.create');
        Route::post('messages/apercu', [MessageController::class, 'preview'])->name('messages.preview');
        Route::get('messages/modeles', [MessageController::class, 'templates'])->name('messages.templates');
        Route::post('messages/modeles', [MessageController::class, 'storeTemplate'])->name('messages.templates.store');
        Route::put('messages/modeles/{template}', [MessageController::class, 'updateTemplate'])->name('messages.templates.update');
        Route::delete('messages/modeles/{template}', [MessageController::class, 'destroyTemplate'])->name('messages.templates.destroy');
        Route::post('messages', [MessageController::class, 'store'])->name('messages.store');
        Route::post('messages/{message}/relancer', [MessageController::class, 'retry'])->name('messages.retry');
        Route::delete('messages/{message}', [MessageController::class, 'destroy'])->name('messages.destroy');

        /*
        | Tout ce qui se règle une fois puis ne bouge plus vit sous « Réglages » :
        | ça sort cinq entrées du menu principal.
        */
        Route::prefix('reglages')->name('shop-settings.')->group(function () {
            Route::redirect('/', '/reglages/boutique');

            Route::get('boutique', [ShopSettingsController::class, 'edit'])->name('edit');
            Route::put('boutique', [ShopSettingsController::class, 'update'])->name('update');
            Route::delete('boutique/logo', [ShopSettingsController::class, 'destroyLogo'])->name('logo.destroy');

            Route::get('integrations', [IntegrationSettingsController::class, 'edit'])->name('integrations');
            Route::put('integrations', [IntegrationSettingsController::class, 'update'])->name('integrations.update');
            Route::post('integrations/test', [IntegrationSettingsController::class, 'test'])
                ->middleware('throttle:6,1')->name('integrations.test');

            Route::put('integrations/email', [IntegrationSettingsController::class, 'updateMail'])->name('integrations.mail');
            Route::post('integrations/email/test', [IntegrationSettingsController::class, 'testMail'])
                ->middleware('throttle:6,1')->name('integrations.mail.test');

            Route::put('integrations/whatsapp/cloud', [IntegrationSettingsController::class, 'updateWhatsappCloud'])->name('integrations.whatsapp.cloud');
            Route::post('integrations/whatsapp/cloud/test', [IntegrationSettingsController::class, 'testWhatsappCloud'])
                ->middleware('throttle:6,1')->name('integrations.whatsapp.cloud.test');

            Route::put('integrations/whatsapp', [IntegrationSettingsController::class, 'updateWhatsapp'])->name('integrations.whatsapp');
            Route::post('integrations/whatsapp/demarrer', [IntegrationSettingsController::class, 'startWhatsapp'])->name('integrations.whatsapp.start');
            Route::post('integrations/whatsapp/arreter', [IntegrationSettingsController::class, 'stopWhatsapp'])->name('integrations.whatsapp.stop');
            Route::get('integrations/whatsapp/etat', [IntegrationSettingsController::class, 'whatsappStatus'])->name('integrations.whatsapp.status');

            Route::get('livraison', [WebSettingsController::class, 'zones'])->name('delivery');
            Route::post('livraison', [WebSettingsController::class, 'storeZone'])->name('delivery.store');
            Route::put('livraison/{zone}', [WebSettingsController::class, 'updateZone'])->name('delivery.update');
            Route::delete('livraison/{zone}', [WebSettingsController::class, 'destroyZone'])->name('delivery.destroy');

            Route::get('accueil-boutique', [WebSettingsController::class, 'home'])->name('web-home');
            Route::post('accueil-boutique', [WebSettingsController::class, 'storeBlock'])->name('web-home.store');
            Route::post('accueil-boutique/{block}', [WebSettingsController::class, 'updateBlock'])->name('web-home.update');
            Route::delete('accueil-boutique/{block}', [WebSettingsController::class, 'destroyBlock'])->name('web-home.destroy');

            Route::get('categories', [CategoryController::class, 'index'])->name('categories');
            Route::get('marques', [BrandController::class, 'index'])->name('brands');
            Route::get('fournisseurs', [SupplierController::class, 'index'])->name('suppliers');
            Route::get('utilisateurs', [UserController::class, 'index'])->name('users');
        });

        /*
        |--------------------------------------------------------------------------
        | Fiches en double
        |--------------------------------------------------------------------------
        */
        Route::get('contacts', [WebSettingsController::class, 'contacts'])->name('contacts.index');
        Route::put('contacts/{message}', [WebSettingsController::class, 'answerContact'])->name('contacts.answer');
        Route::delete('contacts/{message}', [WebSettingsController::class, 'destroyContact'])->name('contacts.destroy');

        Route::get('doublons', [DuplicateController::class, 'index'])->name('duplicates.index');
        Route::post('doublons/fusionner', [DuplicateController::class, 'merge'])->name('duplicates.merge');

        Route::resource('categories', CategoryController::class)
            ->parameters(['categories' => 'category'])
            ->names('categories')
            ->only(['store', 'update', 'destroy']);

        Route::resource('marques', BrandController::class)
            ->parameters(['marques' => 'brand'])
            ->names('brands')
            ->only(['store', 'update', 'destroy']);

        Route::resource('fournisseurs', SupplierController::class)
            ->parameters(['fournisseurs' => 'supplier'])
            ->names('suppliers')
            ->only(['store', 'update', 'destroy']);

        Route::resource('utilisateurs', UserController::class)
            ->parameters(['utilisateurs' => 'user'])
            ->names('users')
            ->only(['store', 'update', 'destroy']);
    });
});

require __DIR__.'/boutique.php';
require __DIR__.'/settings.php';
