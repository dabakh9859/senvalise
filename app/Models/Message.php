<?php

namespace App\Models;

use App\Enums\MessageChannel;
use App\Enums\MessageStatus;
use App\Enums\MessageType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int|null $message_template_id
 * @property int|null $customer_id
 * @property int|null $document_id
 * @property MessageType $type
 * @property MessageChannel $channel
 * @property string $recipient
 * @property string|null $recipient_name
 * @property string|null $subject
 * @property string $body
 * @property MessageStatus $status
 * @property string|null $external_id
 * @property string|null $template_name
 * @property string|null $error
 * @property Carbon|null $sent_at
 * @property Carbon|null $delivered_at
 * @property Carbon|null $read_at
 * @property string|null $batch_id
 * @property string|null $batch_label
 * @property int|null $user_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Customer|null $customer
 * @property-read Document|null $document
 * @property-read MessageTemplate|null $template
 * @property-read User|null $user
 */
#[Fillable([
    'message_template_id', 'customer_id', 'document_id', 'type', 'channel',
    'recipient', 'recipient_name', 'subject', 'body', 'status', 'error',
    'external_id', 'template_name', 'sent_at', 'delivered_at', 'read_at',
    'batch_id', 'batch_label', 'user_id',
])]
class Message extends Model
{
    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'type' => MessageType::class,
            'channel' => MessageChannel::class,
            'status' => MessageStatus::class,
            'sent_at' => 'datetime',
            'delivered_at' => 'datetime',
            'read_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<Document, $this> */
    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    /** @return BelongsTo<MessageTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(MessageTemplate::class, 'message_template_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function markSent(?string $externalId = null): void
    {
        $this->forceFill([
            'status' => MessageStatus::Envoye->value,
            'sent_at' => now(),
            'external_id' => $externalId,
            'error' => null,
        ])->save();
    }

    public function markDelivered(): void
    {
        $this->forceFill(['delivered_at' => $this->delivered_at ?? now()])->save();
    }

    public function markRead(): void
    {
        $this->forceFill([
            'delivered_at' => $this->delivered_at ?? now(),
            'read_at' => $this->read_at ?? now(),
        ])->save();
    }

    public function markFailed(string $reason): void
    {
        $this->forceFill([
            'status' => MessageStatus::Echec->value,
            'error' => mb_substr($reason, 0, 1000),
        ])->save();
    }

    /** @param  Builder<self>  $query */
    public function scopeSearch(Builder $query, ?string $term): void
    {
        if (blank($term)) {
            return;
        }

        $query->where(function (Builder $q) use ($term) {
            $q->where('recipient', 'like', "%{$term}%")
                ->orWhere('recipient_name', 'like', "%{$term}%")
                ->orWhere('subject', 'like', "%{$term}%")
                ->orWhere('body', 'like', "%{$term}%")
                ->orWhere('batch_label', 'like', "%{$term}%");
        });
    }
}
