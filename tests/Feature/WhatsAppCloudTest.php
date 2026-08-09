<?php

namespace Tests\Feature;

use App\Enums\MessageChannel;
use App\Enums\MessageStatus;
use App\Enums\MessageType;
use App\Enums\UserRole;
use App\Jobs\SendMessageJob;
use App\Models\Customer;
use App\Models\Message;
use App\Models\Setting;
use App\Models\User;
use App\Services\Messaging\MessageService;
use App\Services\Messaging\WhatsAppCloudService;
use App\Services\Messaging\WhatsAppGateway;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * WhatsApp par l'API officielle de Meta.
 *
 * Ces tests portent moins sur « le message part » que sur « le message ne
 * part pas » : chaque envoi refusé ici est un envoi que Meta aurait compté
 * contre la réputation du numéro.
 */
class WhatsAppCloudTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE_ID = '123456789012345';

    private const WABA_ID = '987654321098765';

    protected function setUp(): void
    {
        parent::setUp();

        Setting::put(WhatsAppGateway::DRIVER_KEY, WhatsAppGateway::CLOUD);
        Setting::put(WhatsAppCloudService::PHONE_ID_KEY, self::PHONE_ID);
        Setting::put(WhatsAppCloudService::WABA_KEY, self::WABA_ID);
        Setting::put(WhatsAppCloudService::COUNTRY_KEY, '221');
        Setting::putSecret(WhatsAppCloudService::TOKEN_KEY, 'jeton-systeme');
    }

    protected function cloud(): WhatsAppCloudService
    {
        return app(WhatsAppCloudService::class);
    }

    protected function customer(array $attributes = []): Customer
    {
        return Customer::create([
            'type' => 'particulier',
            'name' => 'Fatou Ndiaye',
            'phone' => '77 885 83 74',
            'is_active' => true,
            ...$attributes,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Numéros
    |--------------------------------------------------------------------------
    */

    public function test_a_local_number_gets_the_country_code(): void
    {
        $this->assertSame('221778858374', $this->cloud()->normalise('77 885 83 74'));
        $this->assertSame('221778858374', $this->cloud()->normalise('077 885 83 74'));
        $this->assertSame('221778858374', $this->cloud()->normalise('+221 77 885 83 74'));
    }

    /*
    |--------------------------------------------------------------------------
    | Envoi
    |--------------------------------------------------------------------------
    */

    public function test_a_template_is_sent_to_the_official_endpoint(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'messages' => [['id' => 'wamid.ABC']],
            ]),
        ]);

        $id = $this->cloud()->sendTemplate('77 885 83 74', 'rappel_facture', 'fr', ['Fatou', '35 000 FCFA']);

        $this->assertSame('wamid.ABC', $id);

        Http::assertSent(function ($request) {
            $body = $request->data();

            return str_contains($request->url(), self::PHONE_ID.'/messages')
                && $body['type'] === 'template'
                && $body['to'] === '221778858374'
                && $body['template']['name'] === 'rappel_facture'
                && $body['template']['components'][0]['parameters'][1]['text'] === '35 000 FCFA';
        });
    }

    /** L'erreur de Meta est traduite en phrase que le gérant peut comprendre. */
    public function test_a_closed_window_gives_a_readable_error(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'error' => ['code' => 131047, 'message' => 'Re-engagement message'],
            ], 400),
        ]);

        $this->expectExceptionMessageMatches('/24 h/');

        $this->cloud()->sendText('77 885 83 74', 'Bonjour');
    }

    public function test_an_expired_token_says_so(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'error' => ['code' => 190, 'message' => 'Session has expired'],
            ], 401),
        ]);

        $this->expectExceptionMessageMatches('/jeton/');

        $this->cloud()->sendText('77 885 83 74', 'Bonjour');
    }

    /*
    |--------------------------------------------------------------------------
    | Fenêtre de service
    |--------------------------------------------------------------------------
    */

    public function test_free_text_is_refused_outside_the_window(): void
    {
        Http::fake();

        $gateway = app(WhatsAppGateway::class);
        $customer = $this->customer(['whatsapp_last_inbound_at' => now()->subHours(25)]);

        $this->assertFalse($gateway->windowIsOpen($customer));

        $this->expectExceptionMessageMatches('/24 h/');

        $gateway->send('77 885 83 74', 'Bonjour', $customer);

        Http::assertNothingSent();
    }

    public function test_free_text_passes_inside_the_window(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.OK']]]),
        ]);

        $gateway = app(WhatsAppGateway::class);
        $customer = $this->customer(['whatsapp_last_inbound_at' => now()->subHours(2)]);

        $this->assertTrue($gateway->windowIsOpen($customer));
        $this->assertSame('wamid.OK', $gateway->send('77 885 83 74', 'Bonjour', $customer));
    }

    /*
    |--------------------------------------------------------------------------
    | Consentement
    |--------------------------------------------------------------------------
    */

    public function test_marketing_needs_consent(): void
    {
        Queue::fake();

        $sans = $this->customer(['name' => 'Sans accord']);
        $avec = $this->customer([
            'name' => 'Avec accord',
            'phone' => '77 111 22 33',
            'whatsapp_opt_in_at' => now()->subMonth(),
        ]);

        $result = app(MessageService::class)->queue(
            type: MessageType::Publicite,
            channel: MessageChannel::Whatsapp,
            body: 'Nouvel arrivage de valises !',
            subject: null,
            customers: [$sans, $avec],
            whatsappTemplate: 'nouvel_arrivage',
        );

        $this->assertSame(1, $result['queued']);
        $this->assertCount(1, $result['skipped']);
        $this->assertStringContainsString('publicités', $result['skipped'][0]);
        $this->assertSame($avec->id, Message::first()?->customer_id);
    }

    /** Un « stop » prime sur un accord donné plus tôt. */
    public function test_an_opt_out_beats_an_earlier_opt_in(): void
    {
        $customer = $this->customer([
            'whatsapp_opt_in_at' => now()->subMonth(),
            'whatsapp_opt_out_at' => now()->subDay(),
        ]);

        $this->assertFalse($customer->acceptsWhatsapp());

        // Sauf s'il redonne son accord après coup.
        $customer->forceFill(['whatsapp_opt_in_at' => now()])->save();

        $this->assertTrue($customer->fresh()?->acceptsWhatsapp());
    }

    /** Un rappel de facture n'est pas de la publicité : le consentement n'est pas requis. */
    public function test_a_payment_reminder_does_not_need_marketing_consent(): void
    {
        Queue::fake();

        $customer = $this->customer();

        $result = app(MessageService::class)->queue(
            type: MessageType::RappelPaiement,
            channel: MessageChannel::Whatsapp,
            body: 'Votre facture arrive à échéance.',
            subject: null,
            customers: [$customer],
            whatsappTemplate: 'rappel_facture',
        );

        $this->assertSame(1, $result['queued']);
        $this->assertSame([], $result['skipped']);
    }

    public function test_without_a_template_and_outside_the_window_nothing_is_queued(): void
    {
        Queue::fake();

        $result = app(MessageService::class)->queue(
            type: MessageType::Information,
            channel: MessageChannel::Whatsapp,
            body: 'La boutique ferme à 19 h.',
            subject: null,
            customers: [$this->customer()],
        );

        $this->assertSame(0, $result['queued']);
        $this->assertStringContainsString('24 h', $result['skipped'][0]);
    }

    /*
    |--------------------------------------------------------------------------
    | Rythme d'envoi
    |--------------------------------------------------------------------------
    */

    /** Une campagne s'étale : Meta regarde la vitesse autant que le volume. */
    public function test_a_campaign_is_spread_over_time(): void
    {
        Queue::fake();

        $customers = collect(range(1, 4))
            ->map(fn (int $i) => $this->customer([
                'name' => "Client {$i}",
                'phone' => "7710000{$i}0",
                'whatsapp_opt_in_at' => now(),
            ]))
            ->all();

        app(MessageService::class)->queue(
            type: MessageType::Promotion,
            channel: MessageChannel::Whatsapp,
            body: 'Soldes cette semaine.',
            subject: null,
            customers: $customers,
            whatsappTemplate: 'promo',
        );

        Queue::assertPushed(SendMessageJob::class, 4);

        // Le premier part tout de suite, le quatrième trois créneaux plus tard.
        $delays = [];
        Queue::assertPushed(SendMessageJob::class, function (SendMessageJob $job) use (&$delays) {
            $delays[] = $job->delay;

            return true;
        });

        $this->assertCount(4, $delays);
        $this->assertNotNull($delays[3]);
    }

    /*
    |--------------------------------------------------------------------------
    | Aperçu avant envoi
    |--------------------------------------------------------------------------
    */

    public function test_the_preview_groups_the_reasons(): void
    {
        $customers = [
            $this->customer(['name' => 'Sans numéro', 'phone' => null]),
            $this->customer(['name' => 'Sans accord', 'phone' => '77 222 33 44']),
            $this->customer([
                'name' => 'Prêt',
                'phone' => '77 333 44 55',
                'whatsapp_opt_in_at' => now(),
            ]),
        ];

        $preview = app(MessageService::class)->preview(
            MessageType::Publicite,
            MessageChannel::Whatsapp,
            $customers,
            'nouvel_arrivage',
        );

        $this->assertSame(1, $preview['eligible']);
        $this->assertSame(1, $preview['reasons']['sans numéro de téléphone']);
        $this->assertSame(1, $preview['reasons']['sans consentement WhatsApp']);
    }

    /*
    |--------------------------------------------------------------------------
    | Consentement saisi en boutique
    |--------------------------------------------------------------------------
    */

    /** Cocher la case pose une date : c'est elle qui prouve l'accord. */
    public function test_the_consent_checkbox_stamps_a_date(): void
    {
        $gerant = User::factory()->create([
            'role' => UserRole::Gerant->value,
        ]);
        $customer = $this->customer();

        $this->actingAs($gerant)
            ->put("/clients/{$customer->id}", [
                'type' => 'particulier',
                'name' => 'Fatou Ndiaye',
                'phone' => '77 885 83 74',
                'is_active' => true,
                'whatsapp_opt_in' => true,
            ])
            ->assertRedirect();

        $this->assertTrue($customer->fresh()?->acceptsWhatsapp());
        $this->assertNotNull($customer->fresh()?->whatsapp_opt_in_at);
    }

    /** La décocher vaut retrait, et la date de retrait est conservée. */
    public function test_unchecking_the_consent_records_a_withdrawal(): void
    {
        $gerant = User::factory()->create([
            'role' => UserRole::Gerant->value,
        ]);
        $customer = $this->customer(['whatsapp_opt_in_at' => now()->subMonth()]);

        $this->actingAs($gerant)
            ->put("/clients/{$customer->id}", [
                'type' => 'particulier',
                'name' => 'Fatou Ndiaye',
                'phone' => '77 885 83 74',
                'is_active' => true,
                'whatsapp_opt_in' => false,
            ])
            ->assertRedirect();

        $fresh = $customer->fresh();

        $this->assertFalse($fresh?->acceptsWhatsapp());
        $this->assertNotNull($fresh->whatsapp_opt_out_at);
    }

    /*
    |--------------------------------------------------------------------------
    | Webhook
    |--------------------------------------------------------------------------
    */

    public function test_the_webhook_answers_metas_verification_challenge(): void
    {
        Setting::putSecret(WhatsAppCloudService::VERIFY_TOKEN_KEY, 'mon-jeton');

        $this->get('/webhooks/whatsapp?hub_mode=subscribe&hub_verify_token=mon-jeton&hub_challenge=42')
            ->assertOk()
            ->assertSee('42');

        $this->get('/webhooks/whatsapp?hub_mode=subscribe&hub_verify_token=faux&hub_challenge=42')
            ->assertForbidden();
    }

    /** Sans signature valable, on n'ouvre aucune fenêtre : elle serait fausse. */
    public function test_an_unsigned_webhook_call_is_rejected(): void
    {
        Setting::putSecret(WhatsAppCloudService::APP_SECRET_KEY, 'secret-appli');

        $customer = $this->customer();

        $this->postJson('/webhooks/whatsapp', $this->inboundPayload())
            ->assertForbidden();

        $this->assertNull($customer->fresh()?->whatsapp_last_inbound_at);
    }

    public function test_an_inbound_message_opens_the_service_window(): void
    {
        Http::fake();
        Setting::putSecret(WhatsAppCloudService::APP_SECRET_KEY, 'secret-appli');

        $customer = $this->customer();

        $this->postSigned($this->inboundPayload())->assertOk();

        $this->assertNotNull($customer->fresh()?->whatsapp_last_inbound_at);
        $this->assertTrue(app(WhatsAppGateway::class)->windowIsOpen($customer->fresh()));
    }

    public function test_a_stop_message_unsubscribes_the_customer(): void
    {
        Http::fake();
        Setting::putSecret(WhatsAppCloudService::APP_SECRET_KEY, 'secret-appli');

        $customer = $this->customer(['whatsapp_opt_in_at' => now()->subMonth()]);

        $this->postSigned($this->inboundPayload('STOP'))->assertOk();

        $fresh = $customer->fresh();

        $this->assertNotNull($fresh?->whatsapp_opt_out_at);
        $this->assertFalse($fresh->acceptsWhatsapp());
    }

    public function test_delivery_receipts_are_recorded(): void
    {
        Setting::putSecret(WhatsAppCloudService::APP_SECRET_KEY, 'secret-appli');

        $message = Message::create([
            'type' => MessageType::Information->value,
            'channel' => MessageChannel::Whatsapp->value,
            'recipient' => '221778858374',
            'body' => 'Bonjour',
            'status' => MessageStatus::Envoye->value,
            'external_id' => 'wamid.XYZ',
            'sent_at' => now(),
        ]);

        $this->postSigned([
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'statuses' => [[
                            'id' => 'wamid.XYZ',
                            'status' => 'read',
                        ]],
                    ],
                ]],
            ]],
        ])->assertOk();

        $fresh = $message->fresh();

        $this->assertNotNull($fresh?->delivered_at);
        $this->assertNotNull($fresh->read_at);
    }

    public function test_a_failed_receipt_marks_the_message_as_failed(): void
    {
        Setting::putSecret(WhatsAppCloudService::APP_SECRET_KEY, 'secret-appli');

        $message = Message::create([
            'type' => MessageType::Information->value,
            'channel' => MessageChannel::Whatsapp->value,
            'recipient' => '221778858374',
            'body' => 'Bonjour',
            'status' => MessageStatus::Envoye->value,
            'external_id' => 'wamid.KO',
            'sent_at' => now(),
        ]);

        $this->postSigned([
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'statuses' => [[
                            'id' => 'wamid.KO',
                            'status' => 'failed',
                            'errors' => [['title' => 'Numéro injoignable']],
                        ]],
                    ],
                ]],
            ]],
        ])->assertOk();

        $fresh = $message->fresh();

        $this->assertSame(MessageStatus::Echec, $fresh?->status);
        $this->assertSame('Numéro injoignable', $fresh->error);
    }

    /*
    |--------------------------------------------------------------------------
    | Santé du numéro
    |--------------------------------------------------------------------------
    */

    public function test_the_quality_rating_is_read_from_meta(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'verified_name' => 'SenValise',
                'display_phone_number' => '+221 77 885 83 74',
                'quality_rating' => 'GREEN',
                'messaging_limit_tier' => 'TIER_1K',
            ]),
        ]);

        $health = $this->cloud()->health();

        $this->assertTrue($health['configured']);
        $this->assertSame('SenValise', $health['name']);
        $this->assertSame('Bonne', $health['qualityLabel']);
        $this->assertSame('1 000 clients par jour', $health['tierLabel']);
    }

    /*
    |--------------------------------------------------------------------------
    | Assistants
    |--------------------------------------------------------------------------
    */

    /** @param  array<string, mixed>  $payload */
    protected function postSigned(array $payload): TestResponse
    {
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $signature = 'sha256='.hash_hmac('sha256', (string) $body, 'secret-appli');

        return $this->call(
            'POST',
            '/webhooks/whatsapp',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_X_HUB_SIGNATURE_256' => $signature,
            ],
            (string) $body,
        );
    }

    /** @return array<string, mixed> */
    protected function inboundPayload(string $text = 'Bonjour, vous avez des valises cabine ?'): array
    {
        return [
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'messages' => [[
                            'id' => 'wamid.IN',
                            'from' => '221778858374',
                            'type' => 'text',
                            'text' => ['body' => $text],
                        ]],
                    ],
                ]],
            ]],
        ];
    }
}
