<?php

namespace Database\Seeders;

use App\Enums\MessageChannel;
use App\Enums\MessageType;
use App\Models\MessageTemplate;
use Illuminate\Database\Seeder;

/**
 * Quelques modèles pour démarrer.
 *
 * Ils sont écrits en français courant, prêts à être envoyés tels quels ou
 * retouchés depuis l'écran Messages → Modèles.
 */
class MessageTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $templates = [
            [
                'name' => 'Rappel de paiement — première relance',
                'type' => MessageType::RappelPaiement,
                'channel' => MessageChannel::Whatsapp,
                'subject' => null,
                'body' => "Bonjour {client},\n\nNous vous rappelons que la facture {facture} d'un montant de {montant} reste due, avec un solde de {reste}. Échéance : {echeance}.\n\nMerci de votre confiance.\n{boutique} — {telephone}",
            ],
            [
                'name' => 'Rappel de paiement — par e-mail',
                'type' => MessageType::RappelPaiement,
                'channel' => MessageChannel::Email,
                'subject' => 'Facture {facture} — solde de {reste}',
                'body' => "Bonjour {client},\n\nSauf erreur de notre part, la facture {facture} du montant de {montant} présente encore un solde de {reste}, à régler pour le {echeance}.\n\nSi le règlement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\nCordialement,\n{boutique}\n{telephone}",
            ],
            [
                'name' => 'Nouvel arrivage',
                'type' => MessageType::Publicite,
                'channel' => MessageChannel::Whatsapp,
                'subject' => null,
                'body' => "Bonjour {client},\n\nUn nouvel arrivage de valises vient d'arriver chez {boutique} : nouveaux modèles, nouvelles couleurs, toutes tailles.\n\nPassez voir, on vous réserve un bon accueil !\n{telephone}",
            ],
            [
                'name' => 'Promotion en cours',
                'type' => MessageType::Promotion,
                'channel' => MessageChannel::Whatsapp,
                'subject' => null,
                'body' => "Bonjour {client},\n\nPromotion en cours chez {boutique} : profitez-en avant la fin du stock.\n\nÀ très vite,\n{telephone}",
            ],
            [
                'name' => 'Merci pour votre achat',
                'type' => MessageType::Remerciement,
                'channel' => MessageChannel::Whatsapp,
                'subject' => null,
                'body' => "Bonjour {client},\n\nMerci pour votre achat chez {boutique}. Nous restons à votre disposition si vous avez la moindre question.\n\n{telephone}",
            ],
        ];

        foreach ($templates as $template) {
            MessageTemplate::firstOrCreate(
                ['name' => $template['name']],
                [
                    'type' => $template['type']->value,
                    'channel' => $template['channel']->value,
                    'subject' => $template['subject'],
                    'body' => $template['body'],
                    'is_active' => true,
                ],
            );
        }
    }
}
