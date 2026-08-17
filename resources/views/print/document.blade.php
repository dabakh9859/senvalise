@php
    use App\Support\Money;

    $type = $document->type;
    $isQuote = $type->value === 'devis';
    $isDelivery = $type->value === 'bon_livraison';

    /*
     * Le statut se lit en une pastille. Le bleu dit « c'est réglé », le jaune
     * « il reste quelque chose à faire », le rouge « annulé ». Aucun autre
     * état n'a de pastille : un brouillon n'a rien à annoncer.
     */
    $badge = match ($document->status->value) {
        'paye' => ['Payé', 'ok'],
        'livre' => ['Livré', 'ok'],
        'accepte' => ['Accepté', 'ok'],
        'partiellement_paye' => ['Partiellement payé', 'wait'],
        'envoye' => ['En attente de règlement', 'wait'],
        'refuse' => ['Refusé', 'stop'],
        'annule' => ['Annulé', 'stop'],
        default => null,
    };

    $decimals = static fn (float $rate) => rtrim(rtrim(number_format($rate, 2, ',', ' '), '0'), ',');
@endphp
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $type->label() }} {{ $document->reference }}</title>
    <style>
        /*
         * Mise en page en tableaux : dompdf ne connaît ni flexbox ni grid.
         *
         * Les marges verticales de @page réservent la place du bandeau et du
         * pied, qui sont en position fixe et se repeignent donc sur chaque
         * page. Les marges latérales sont nulles pour que le bandeau touche le
         * bord du papier ; ce sont les blocs internes qui portent le retrait.
         */
        @page { size: A4; margin: 32mm 0 20mm; }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            font-family: "DejaVu Sans", Arial, sans-serif;
            font-size: 10px;
            line-height: 1.55;
            color: #101418;
            background: #fff;
        }

        table { width: 100%; border-collapse: collapse; }
        td, th { vertical-align: top; }

        .wrap { padding: 0 14mm; }
        .num { text-align: right; white-space: nowrap; }

        /* ---------- Bandeau ---------- */

        /*
         * top négatif, et non zéro : dompdf place un élément fixe par rapport
         * à la zone de contenu, donc sous la marge haute de @page. Le décalage
         * de -32mm le ramène au bord du papier, et il se repeint ainsi sur
         * chaque page comme un vrai papier à en-tête.
         */
        .band {
            position: fixed;
            top: -32mm;
            left: 0;
            right: 0;
            height: 28mm;
            background: #1f3fe0;
            /* Le jaune de la marque tient dans ce filet : une couleur qui
               n'apparaît qu'une fois se remarque, répartout elle devient un
               décor. */
            border-bottom: 3px solid #efac10;
        }
        .band-inner { padding: 6.5mm 14mm 0; }

        .shop-name {
            font-size: 15px;
            font-weight: bold;
            color: #fff;
            letter-spacing: 0.3px;
        }
        .shop-tagline {
            font-size: 8.5px;
            color: #c3cdfb;
            letter-spacing: 0.2px;
        }
        .shop-meta { font-size: 8px; color: #b6c2fa; padding-top: 1.5mm; }

        .doc-type {
            font-size: 19px;
            font-weight: bold;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 2.5px;
            text-align: right;
        }
        .doc-ref {
            font-size: 10px;
            color: #efac10;
            text-align: right;
            letter-spacing: 1px;
            padding-top: 0.5mm;
        }

        /* ---------- Étiquettes de section ---------- */

        .label {
            font-size: 7px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1.4px;
            color: #8b93a1;
        }

        /* ---------- Client et références ---------- */

        .meta { margin-top: 8mm; }

        .party-name { font-size: 12.5px; font-weight: bold; padding-top: 1mm; }
        .party-line { color: #3f4753; }

        .facts td { padding: 1.2mm 0; }
        .facts .k { color: #6b7280; }
        .facts .v { text-align: right; font-weight: bold; white-space: nowrap; }

        .badge {
            display: inline-block;
            padding: 1.2mm 3mm;
            border-radius: 20px;
            font-size: 8px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }
        .badge-ok { background: #1f3fe0; color: #fff; }
        .badge-wait { background: #fdf3dd; color: #7a5405; border: 1px solid #efac10; }
        .badge-stop { background: #fdeaea; color: #a51b1b; border: 1px solid #e3b3b3; }

        /* ---------- Lignes ---------- */

        .items { margin-top: 7mm; }
        .items th {
            background: #f5f7fe;
            border-top: 1px solid #dfe3ee;
            border-bottom: 1px solid #dfe3ee;
            padding: 2.4mm 3mm;
            font-size: 7.5px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1.1px;
            text-align: left;
            color: #4a5568;
        }
        .items th.num { text-align: right; }
        .items td { padding: 2.6mm 3mm; border-bottom: 1px solid #eceef3; }
        .items .designation { font-weight: bold; font-size: 10.5px; }
        .items .description { color: #6b7280; font-size: 9px; }
        .items .sku { color: #a3aab6; font-size: 8px; letter-spacing: 0.4px; }
        .items .qty { font-weight: bold; }

        /* ---------- Bas de page ---------- */

        .bottom { margin-top: 6mm; }

        .totals td { padding: 1.6mm 3mm; }
        .totals .k { text-align: right; color: #4a5568; }
        .totals .v { text-align: right; white-space: nowrap; width: 34mm; }

        /*
         * Le total est le seul chiffre que le client cherche : c'est le plus
         * gros de la page, posé sur un aplat, souligné du jaune de la marque.
         */
        .grand { background: #f0f3fe; }
        .grand td { padding: 3mm; border-top: 2px solid #1f3fe0; }
        .grand .k {
            text-transform: uppercase;
            letter-spacing: 1.2px;
            font-size: 8.5px;
            font-weight: bold;
            color: #1f3fe0;
        }
        .grand .v { font-size: 16px; font-weight: bold; color: #101418; }

        .due td { border-top: 1px solid #efac10; padding-top: 2.2mm; }
        .due .k, .due .v { color: #a51b1b; font-weight: bold; }

        .block { margin-bottom: 4mm; }
        .block-text { color: #3f4753; white-space: pre-line; padding-top: 0.8mm; }

        .callout {
            border-left: 3px solid #efac10;
            background: #fffaf0;
            padding: 2.5mm 3mm;
        }

        /* ---------- Signatures ---------- */

        .sign { margin-top: 10mm; }
        .sign-line {
            border-top: 1px solid #c8cdd6;
            width: 52mm;
            padding-top: 1.5mm;
            font-size: 8.5px;
            color: #8b93a1;
        }

        /* ---------- Pied ---------- */

        .foot {
            position: fixed;
            bottom: -14mm;
            left: 0;
            right: 0;
            height: 14mm;
            padding: 3mm 14mm 0;
            border-top: 1px solid #eceef3;
            font-size: 7.5px;
            color: #a3aab6;
        }
        .foot .right { text-align: right; }

        /* ---------- Écran ---------- */

        .actions { margin-top: 8mm; text-align: center; }
        .actions button {
            font: inherit;
            font-size: 12px;
            padding: 8px 20px;
            border: 0;
            border-radius: 6px;
            background: #1f3fe0;
            color: #fff;
            cursor: pointer;
        }

        @if (! $isPdf)
            /*
             * À l'écran il n'y a pas de marge de page : le corps compense
             * lui-même la hauteur du bandeau et du pied. À l'impression,
             * @page s'en charge et ce rembourrage doit disparaître.
             *
             * Ces règles ne sont émises que pour le navigateur : dompdf lit le
             * média « screen » par défaut et appliquerait la première.
             */
            @media screen {
                body { padding: 34mm 0 0; background: #e9ebef; }

                /*
                 * À l'écran on simule la feuille : fond blanc, largeur d'une
                 * A4. Le bandeau et le pied restent pleine largeur mais leur
                 * contenu se recale sur cette feuille, sinon le nom de la
                 * boutique ne serait pas dans l'axe du reste.
                 */
                .wrap {
                    max-width: 210mm;
                    margin: 0 auto;
                    padding-top: 8mm;
                    padding-bottom: 24mm;
                    background: #fff;
                    box-shadow: 0 1px 3px rgba(16, 20, 24, 0.12);
                }
                .band { top: 0; }
                .band-inner { max-width: 210mm; margin: 0 auto; }
                .foot {
                    bottom: 0;
                    background: #fff;
                    padding-left: max(14mm, calc((100% - 210mm) / 2 + 14mm));
                    padding-right: max(14mm, calc((100% - 210mm) / 2 + 14mm));
                }
            }
            @media print {
                body { padding: 0; background: #fff; }
                .actions { display: none; }
            }
        @endif
    </style>
</head>
<body>

    <div class="band">
        <table class="band-inner">
            <tr>
                <td style="width: 58%;">
                    @if (! empty($shop['logo']))
                        <img src="{{ $shop['logo'] }}" alt="" style="max-height: 11mm; margin-bottom: 1mm;">
                    @endif
                    <div class="shop-name">{{ $shop['name'] }}</div>
                    @if ($shop['tagline'])
                        <div class="shop-tagline">{{ $shop['tagline'] }}</div>
                    @endif
                    <div class="shop-meta">
                        @if ($shop['address']){{ $shop['address'] }}@endif
                        @if ($shop['phone']) &middot; {{ $shop['phone'] }}@endif
                        @if ($shop['email']) &middot; {{ $shop['email'] }}@endif
                    </div>
                </td>
                <td style="width: 42%;">
                    <div class="doc-type">{{ $type->label() }}</div>
                    <div class="doc-ref">{{ $document->reference }}</div>
                </td>
            </tr>
        </table>
    </div>

    <div class="wrap">

        <table class="meta">
            <tr>
                <td style="width: 55%; padding-right: 10mm;">
                    <div class="label">{{ $isDelivery ? 'Livré à' : 'Facturé à' }}</div>
                    <div class="party-name">{{ $document->customer_name ?: 'Client de passage' }}</div>
                    <div class="party-line">
                        @if ($document->customer_address){{ $document->customer_address }}<br>@endif
                        @if ($document->customer_phone)Tél. {{ $document->customer_phone }}@endif
                    </div>
                </td>
                <td style="width: 45%;">
                    <table class="facts">
                        <tr>
                            <td class="k">{{ $isQuote ? 'Date du devis' : 'Date d’émission' }}</td>
                            <td class="v">{{ $document->issue_date?->format('d/m/Y') }}</td>
                        </tr>
                        @if ($isQuote && $document->valid_until)
                            <tr>
                                <td class="k">Valable jusqu’au</td>
                                <td class="v">{{ $document->valid_until->format('d/m/Y') }}</td>
                            </tr>
                        @endif
                        @if ($document->due_date)
                            <tr>
                                <td class="k">Échéance</td>
                                <td class="v">{{ $document->due_date->format('d/m/Y') }}</td>
                            </tr>
                        @endif
                        @if ($isDelivery && $document->delivery_date)
                            <tr>
                                <td class="k">Date de livraison</td>
                                <td class="v">{{ $document->delivery_date->format('d/m/Y') }}</td>
                            </tr>
                        @endif
                        @if ($badge)
                            <tr>
                                <td class="k">Statut</td>
                                <td class="v">
                                    <span class="badge badge-{{ $badge[1] }}">{{ $badge[0] }}</span>
                                </td>
                            </tr>
                        @endif
                    </table>
                </td>
            </tr>
        </table>

        <table class="items">
            <thead>
                <tr>
                    <th style="width: {{ $isDelivery ? '80%' : '44%' }};">Désignation</th>
                    <th class="num" style="width: {{ $isDelivery ? '20%' : '9%' }};">Qté</th>
                    @unless ($isDelivery)
                        <th class="num" style="width: 16%;">Prix unitaire</th>
                        <th class="num" style="width: 13%;">Remise</th>
                        <th class="num" style="width: 18%;">Montant</th>
                    @endunless
                </tr>
            </thead>
            <tbody>
                @foreach ($document->items as $item)
                    <tr>
                        <td>
                            <div class="designation">{{ $item->designation }}</div>
                            @if ($item->description)
                                <div class="description">{{ $item->description }}</div>
                            @endif
                            @if ($item->variant?->sku)
                                <div class="sku">RÉF. {{ $item->variant->sku }}</div>
                            @endif
                        </td>
                        <td class="num qty">{{ $item->quantity }}</td>
                        @unless ($isDelivery)
                            <td class="num">{{ Money::format($item->unit_price, false) }}</td>
                            <td class="num">{{ $item->discount > 0 ? '-'.Money::format($item->discount, false) : '—' }}</td>
                            <td class="num" style="font-weight: bold;">{{ Money::format($item->line_total, false) }}</td>
                        @endunless
                    </tr>
                @endforeach
            </tbody>
        </table>

        <table class="bottom">
            <tr>
                <td style="width: 50%; padding-right: 10mm;">
                    @if ($document->notes)
                        <div class="block">
                            <div class="label">Note</div>
                            <div class="block-text">{{ $document->notes }}</div>
                        </div>
                    @endif

                    @if ($document->terms)
                        <div class="block callout">
                            <div class="label">Conditions</div>
                            <div class="block-text">{{ $document->terms }}</div>
                        </div>
                    @endif

                    @if ($shop['ninea'] || $shop['rc'])
                        <div class="block">
                            <div class="label">Identification</div>
                            <div class="block-text">
                                @if ($shop['ninea'])NINEA {{ $shop['ninea'] }}@endif
                                @if ($shop['ninea'] && $shop['rc']) &middot; @endif
                                @if ($shop['rc'])RC {{ $shop['rc'] }}@endif
                            </div>
                        </div>
                    @endif
                </td>

                <td style="width: 50%;">
                    @unless ($isDelivery)
                        <table class="totals">
                            <tr>
                                <td class="k">Sous-total</td>
                                <td class="v">{{ Money::format($document->subtotal, false) }}</td>
                            </tr>
                            @if ($document->discount > 0)
                                <tr>
                                    <td class="k">Remise globale</td>
                                    <td class="v">-{{ Money::format($document->discount, false) }}</td>
                                </tr>
                            @endif
                            @if ($document->tax_amount > 0)
                                <tr>
                                    <td class="k">{{ $taxLabel }} ({{ $decimals((float) $document->tax_rate) }} %)</td>
                                    <td class="v">{{ Money::format($document->tax_amount, false) }}</td>
                                </tr>
                            @endif
                            <tr class="grand">
                                <td class="k">{{ $isQuote ? 'Montant du devis' : 'Total à payer' }}</td>
                                <td class="v">{{ Money::format($document->total) }}</td>
                            </tr>
                            @if ($document->amount_paid > 0)
                                <tr>
                                    <td class="k">Déjà réglé</td>
                                    <td class="v">{{ Money::format($document->amount_paid, false) }}</td>
                                </tr>
                            @endif
                            @if ($document->balance_due > 0)
                                <tr class="due">
                                    <td class="k">Reste à payer</td>
                                    <td class="v">{{ Money::format($document->balance_due) }}</td>
                                </tr>
                            @endif
                        </table>
                    @else
                        <table class="totals">
                            <tr class="grand">
                                <td class="k">Articles livrés</td>
                                <td class="v">{{ $document->items->sum('quantity') }}</td>
                            </tr>
                        </table>
                    @endunless
                </td>
            </tr>
        </table>

        <table class="sign">
            <tr>
                <td style="width: 50%;">
                    <div class="sign-line">{{ $isDelivery ? 'Signature du client, marchandise reçue' : 'Le client' }}</div>
                </td>
                <td style="width: 50%;">
                    <div class="sign-line" style="margin-left: auto;">Pour {{ $shop['name'] }}</div>
                </td>
            </tr>
        </table>

        @unless ($isPdf)
            <div class="actions">
                <button type="button" onclick="window.print()">Imprimer</button>
            </div>
        @endunless
    </div>

    <div class="foot">
        <table>
            <tr>
                <td>{{ $shop['name'] }} &middot; {{ $type->label() }} {{ $document->reference }}</td>
                <td class="right">
                    @if ($document->user)Établi par {{ $document->user->name }} &middot; @endif
                    {{ $document->created_at?->format('d/m/Y à H:i') }}
                </td>
            </tr>
        </table>
    </div>

    @unless ($isPdf)
        <script>
            window.addEventListener('load', () => window.print());
        </script>
    @endunless
</body>
</html>
