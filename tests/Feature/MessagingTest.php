<?php

namespace Tests\Feature;

use App\Enums\MessageChannel;
use App\Enums\MessageStatus;
use App\Enums\MessageType;
use App\Enums\UserRole;
use App\Jobs\SendMessageJob;
use App\Mail\CustomerMessage;
use App\Models\Customer;
use App\Models\Message;
use App\Models\MessageTemplate;
use App\Models\Setting;
use App\Models\User;
use App\Services\Messaging\MailSettings;
use App\Services\Messaging\MessageComposer;
use App\Services\Messaging\MessageService;
use App\Services\Messaging\WhatsAppGateway;
use App\Services\Messaging\WhatsAppService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class MessagingTest extends TestCase
{
    use RefreshDatabase;

    protected function gerant(): User
    {
        return User::factory()->create(['role' => UserRole::Gerant->value]);
    }

    /**
     * Bascule sur le pont WAHA.
     *
     * Le pilote par defaut est l'API officielle de Meta, qui refuse tout envoi
     * sans consentement ni modele approuve. Ces tests-la portent sur l'autre
     * transport : on le choisit explicitement.
     */
    protected function configureWhatsapp(): void
    {
        Setting::put(WhatsAppGateway::DRIVER_KEY, WhatsAppGateway::WAHA);
        Setting::put(WhatsAppService::URL_KEY, 'https://waha.exemple.test');
        Setting::put(WhatsAppService::SESSION_KEY, 'default');
        Setting::put(WhatsAppService::COUNTRY_KEY, '221');
    }

    protected function configureMail(): void
    {
        Setting::put('mail_host', 'smtp.exemple.test');
        Setting::put('mail_port', 587);
        Setting::put('mail_from_address', 'contact@senvalise.sn');
        Setting::put('mail_from_name', 'SenValise');
    }

    /*
    |--------------------------------------------------------------------------
    | Personnalisation du texte
    |--------------------------------------------------------------------------
    */

    public function test_variables_are_replaced_for_each_customer(): void
    {
        Setting::put('shop_name', 'SenValise');

        $customer = Customer::create(['name' => 'Fatou Ndiaye', 'phone' => '77 123 45 67']);

        $rendered = app(MessageComposer::class)
            ->render('Bonjour {client}, ici {boutique}.', $customer);

        $this->assertSame('Bonjour Fatou Ndiaye, ici SenValise.', $rendered);
    }

    public function test_a_company_is_addressed_by_its_business_name(): void
    {
        $customer = Customer::create([
            'name' => 'Ibrahima Fall',
            'type' => 'entreprise',
            'company_name' => 'Sénégal Voyages SARL',
            'phone' => '33 821 00 00',
        ]);

        $rendered = app(MessageComposer::class)->render('Bonjour {client}', $customer);

        $this->assertSame('Bonjour Sénégal Voyages SARL', $rendered);
    }

    /*
    |--------------------------------------------------------------------------
    | Mise en file
    |--------------------------------------------------------------------------
    */

    public function test_one_message_is_queued_per_recipient(): void
    {
        Queue::fake();

        $customers = [
            Customer::create([
                'name' => 'Client A',
                'phone' => '77 000 00 01',
                'whatsapp_opt_in_at' => now(),
            ]),
            Customer::create([
                'name' => 'Client B',
                'phone' => '77 000 00 02',
                'whatsapp_opt_in_at' => now(),
            ]),
        ];

        $result = app(MessageService::class)->queue(
            type: MessageType::Publicite,
            channel: MessageChannel::Whatsapp,
            body: 'Bonjour {client}',
            subject: null,
            customers: $customers,
            label: 'Arrivage septembre',
            whatsappTemplate: 'nouvel_arrivage',
        );

        $this->assertSame(2, $result['queued']);
        $this->assertSame([], $result['skipped']);
        $this->assertDatabaseCount('messages', 2);
        Queue::assertPushed(SendMessageJob::class, 2);

        $this->assertSame('Bonjour Client A', Message::first()->body);
    }

    /** Un client sans coordonnée est écarté, sans bloquer les autres. */
    public function test_a_customer_without_the_needed_contact_is_skipped(): void
    {
        Queue::fake();

        $customers = [
            Customer::create(['name' => 'Avec e-mail', 'email' => 'a@exemple.test']),
            Customer::create(['name' => 'Sans e-mail', 'phone' => '77 000 00 03']),
        ];

        $result = app(MessageService::class)->queue(
            type: MessageType::Publicite,
            channel: MessageChannel::Email,
            body: 'Bonjour',
            subject: 'Objet',
            customers: $customers,
        );

        $this->assertSame(1, $result['queued']);
        $this->assertCount(1, $result['skipped']);
        $this->assertStringContainsString('Sans e-mail', $result['skipped'][0]);
    }

    /** Le texte est figé : modifier le modèle ensuite ne réécrit pas l'envoyé. */
    public function test_the_sent_text_is_frozen(): void
    {
        Queue::fake();

        $template = MessageTemplate::create([
            'name' => 'Promo',
            'type' => MessageType::Promotion->value,
            'channel' => MessageChannel::Whatsapp->value,
            'body' => 'Texte initial',
        ]);

        app(MessageService::class)->queue(
            type: MessageType::Promotion,
            channel: MessageChannel::Whatsapp,
            body: $template->body,
            subject: null,
            customers: [Customer::create([
                'name' => 'Client',
                'phone' => '77 000 00 04',
                'whatsapp_opt_in_at' => now(),
            ])],
            template: $template,
            whatsappTemplate: 'promo',
        );

        $template->update(['body' => 'Texte modifié']);

        $this->assertSame('Texte initial', Message::first()->body);
    }

    /*
    |--------------------------------------------------------------------------
    | Envoi
    |--------------------------------------------------------------------------
    */

    public function test_an_email_is_sent_and_the_message_marked_as_sent(): void
    {
        Mail::fake();
        $this->configureMail();

        $message = Message::create([
            'type' => MessageType::Publicite->value,
            'channel' => MessageChannel::Email->value,
            'recipient' => 'client@exemple.test',
            'subject' => 'Nouvel arrivage',
            'body' => 'Bonjour',
            'status' => MessageStatus::EnAttente->value,
        ]);

        app(SendMessageJob::class, ['messageId' => $message->id])
            ->handle(app(MailSettings::class), app(WhatsAppGateway::class));

        Mail::assertSent(
            CustomerMessage::class,
            fn (CustomerMessage $mail) => $mail->hasTo('client@exemple.test')
                && $mail->message->subject === 'Nouvel arrivage',
        );

        $this->assertSame(MessageStatus::Envoye, $message->fresh()->status);
        $this->assertNotNull($message->fresh()->sent_at);
    }

    public function test_a_whatsapp_message_is_posted_to_waha(): void
    {
        $this->configureWhatsapp();
        Http::fake(['waha.exemple.test/*' => Http::response(['id' => 'abc'])]);

        $message = Message::create([
            'type' => MessageType::Publicite->value,
            'channel' => MessageChannel::Whatsapp->value,
            'recipient' => '77 885 83 74',
            'body' => 'Bonjour',
            'status' => MessageStatus::EnAttente->value,
        ]);

        app(SendMessageJob::class, ['messageId' => $message->id])
            ->handle(app(MailSettings::class), app(WhatsAppGateway::class));

        $this->assertSame(MessageStatus::Envoye, $message->fresh()->status);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/api/sendText')
            && $request['chatId'] === '221778858374@c.us');
    }

    /** Un échec est consigné avec sa raison, pas silencieux. */
    public function test_a_failure_is_recorded_with_its_reason(): void
    {
        $this->configureWhatsapp();
        Http::fake(['waha.exemple.test/*' => Http::response(['message' => 'Numéro absent de WhatsApp'], 422)]);

        $message = Message::create([
            'type' => MessageType::Publicite->value,
            'channel' => MessageChannel::Whatsapp->value,
            'recipient' => '77 000 00 05',
            'body' => 'Bonjour',
            'status' => MessageStatus::EnAttente->value,
        ]);

        try {
            app(SendMessageJob::class, ['messageId' => $message->id])
                ->handle(app(MailSettings::class), app(WhatsAppGateway::class));
        } catch (RuntimeException) {
            // Attendu : la tâche relaie l'erreur pour permettre un nouvel essai.
        }

        $message->refresh();

        $this->assertSame(MessageStatus::Echec, $message->status);
        $this->assertStringContainsString('Numéro absent', (string) $message->error);
    }

    /*
    |--------------------------------------------------------------------------
    | Numéros
    |--------------------------------------------------------------------------
    */

    /** @return array<int, array<int, string>> */
    public static function phoneNumbers(): array
    {
        return [
            ['77 885 83 74', '221778858374@c.us'],
            ['778858374', '221778858374@c.us'],
            ['+221 77 885 83 74', '221778858374@c.us'],
            ['00221778858374', '221778858374@c.us'],
            ['221778858374', '221778858374@c.us'],
        ];
    }

    #[DataProvider('phoneNumbers')]
    public function test_phone_numbers_are_normalised(string $input, string $expected): void
    {
        $this->configureWhatsapp();

        $this->assertSame($expected, app(WhatsAppService::class)->chatId($input));
    }

    /*
    |--------------------------------------------------------------------------
    | Écrans
    |--------------------------------------------------------------------------
    */

    public function test_the_history_can_be_filtered(): void
    {
        Message::create([
            'type' => MessageType::Publicite->value,
            'channel' => MessageChannel::Whatsapp->value,
            'recipient' => '77 000 00 06',
            'recipient_name' => 'Aminata',
            'body' => 'Promo',
            'status' => MessageStatus::Envoye->value,
        ]);

        Message::create([
            'type' => MessageType::RappelPaiement->value,
            'channel' => MessageChannel::Email->value,
            'recipient' => 'autre@exemple.test',
            'body' => 'Rappel',
            'status' => MessageStatus::Echec->value,
        ]);

        $this->actingAs($this->gerant())
            ->get('/messages?statut=echec')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('messages.data', 1));

        $this->actingAs($this->gerant())
            ->get('/messages?recherche=Aminata')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('messages.data', 1));
    }

    public function test_sending_is_refused_when_the_channel_is_not_ready(): void
    {
        Queue::fake();

        $customer = Customer::create(['name' => 'Client', 'phone' => '77 000 00 07']);

        $this->actingAs($this->gerant())
            ->post('/messages', [
                'type' => MessageType::Publicite->value,
                'channel' => MessageChannel::Whatsapp->value,
                'body' => 'Bonjour',
                'customer_ids' => [$customer->id],
            ])
            ->assertRedirect();

        $this->assertDatabaseCount('messages', 0);
        Queue::assertNothingPushed();
    }

    public function test_a_seller_cannot_reach_the_messages_screen(): void
    {
        $this->actingAs(User::factory()->create(['role' => UserRole::Vendeur->value]))
            ->get('/messages')
            ->assertForbidden();
    }

    public function test_templates_can_be_managed(): void
    {
        $gerant = $this->gerant();

        $this->actingAs($gerant)
            ->post('/messages/modeles', [
                'name' => 'Relance',
                'type' => MessageType::RappelPaiement->value,
                'channel' => MessageChannel::Whatsapp->value,
                'body' => 'Bonjour {client}, votre facture {facture}.',
                'is_active' => true,
            ])
            ->assertRedirect();

        $template = MessageTemplate::firstOrFail();

        $this->assertSame('Relance', $template->name);

        $this->actingAs($gerant)
            ->delete("/messages/modeles/{$template->id}")
            ->assertRedirect();

        $this->assertDatabaseCount('message_templates', 0);
    }
}
