@php
    use App\Support\Money;

    $type = $document->type;
    $isQuote = $type->value === 'devis';
    $isDelivery = $type->value === 'bon_livraison';
@endphp
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $type->label() }} {{ $document->reference }}</title>
    <style>
        /* Mise en page en tableaux : dompdf ne gère ni flexbox ni grid. */
        @page { size: A4; margin: 14mm 12mm; }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            font-family: "DejaVu Sans", Arial, sans-serif;
            font-size: 11px;
            line-height: 1.5;
            color: #1a1a1a;
            background: #fff;
        }

        table { width: 100%; border-collapse: collapse; }
        td, th { vertical-align: top; }

        .header td { padding-bottom: 4px; }
        .shop-name { font-size: 22px; font-weight: bold; color: #1d4ed8; letter-spacing: 0.5px; }
        .shop-tagline { font-size: 10px; color: #666; }
        .shop-meta { font-size: 10px; color: #444; }

        .doc-title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-align: right;
        }
        .doc-ref { text-align: right; font-size: 13px; font-weight: bold; }
        .doc-dates { text-align: right; font-size: 10px; color: #444; }

        .rule { border-top: 2px solid #1d4ed8; margin: 10px 0 14px; }

        .party {
            border: 1px solid #d4d4d4;
            border-radius: 3px;
            padding: 8px 10px;
            width: 48%;
        }
        .party-label {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #666;
            margin-bottom: 3px;
        }
        .party-name { font-weight: bold; font-size: 13px; }

        .items { margin-top: 16px; }
        .items th {
            background: #f1f5f9;
            border-bottom: 1.5px solid #cbd5e1;
            padding: 7px 6px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            text-align: left;
            color: #334155;
        }
        .items td {
            padding: 7px 6px;
            border-bottom: 1px solid #e5e7eb;
        }
        .items .num { text-align: right; white-space: nowrap; }
        .items .designation { font-weight: 600; }
        .items .description { font-size: 10px; color: #666; }
        .items .sku { font-size: 9px; color: #94a3b8; }

        .totals { margin-top: 12px; }
        .totals td { padding: 4px 6px; }
        .totals .label { text-align: right; color: #475569; }
        .totals .value { text-align: right; white-space: nowrap; width: 110px; }
        .totals .grand td {
            border-top: 2px solid #1d4ed8;
            font-size: 15px;
            font-weight: bold;
            padding-top: 8px;
        }
        .totals .due td { color: #b91c1c; font-weight: bold; }

        .notes {
            margin-top: 18px;
            font-size: 10px;
            color: #444;
            white-space: pre-line;
        }
        .notes-title {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #666;
            margin-bottom: 2px;
        }

        .signature { margin-top: 26px; font-size: 10px; }
        .signature-box {
            border-top: 1px solid #94a3b8;
            width: 180px;
            padding-top: 4px;
            color: #666;
        }

        .footer {
            margin-top: 22px;
            padding-top: 8px;
            border-top: 1px solid #e5e7eb;
            font-size: 9px;
            color: #94a3b8;
            text-align: center;
        }

        .stamp {
            display: inline-block;
            padding: 3px 10px;
            border: 1.5px solid #16a34a;
            color: #16a34a;
            border-radius: 3px;
            font-weight: bold;
            font-size: 11px;
            text-transform: uppercase;
        }
        .stamp-danger { border-color: #b91c1c; color: #b91c1c; }

        .actions { margin-top: 18px; text-align: center; }
        .actions button {
            font: inherit;
            padding: 8px 18px;
            cursor: pointer;
        }

        @media print {
            .actions { display: none; }
        }
    </style>
</head>
<body>

    <table class="header">
        <tr>
            <td style="width: 55%;">
                <div class="shop-name">{{ $shop['name'] }}</div>
                @if ($shop['tagline'])
                    <div class="shop-tagline">{{ $shop['tagline'] }}</div>
                @endif
                <div class="shop-meta">
                    @if ($shop['address']){{ $shop['address'] }}<br>@endif
                    @if ($shop['phone'])Tél. {{ $shop['phone'] }}@endif
                    @if ($shop['email']) · {{ $shop['email'] }}@endif
                    @if ($shop['ninea'])<br>NINEA : {{ $shop['ninea'] }}@endif
                    @if ($shop['rc']) · RC : {{ $shop['rc'] }}@endif
                </div>
            </td>
            <td style="width: 45%;">
                <div class="doc-title">{{ $type->label() }}</div>
                <div class="doc-ref">{{ $document->reference }}</div>
                <div class="doc-dates">
                    Date : {{ $document->issue_date?->format('d/m/Y') }}
                    @if ($isQuote && $document->valid_until)
                        <br>Valable jusqu'au {{ $document->valid_until->format('d/m/Y') }}
                    @endif
                    @if ($document->due_date)
                        <br>Échéance : {{ $document->due_date->format('d/m/Y') }}
                    @endif
                    @if ($isDelivery && $document->delivery_date)
                        <br>Livraison : {{ $document->delivery_date->format('d/m/Y') }}
                    @endif
                </div>
            </td>
        </tr>
    </table>

    <div class="rule"></div>

    <table>
        <tr>
            <td style="width: 50%; padding-right: 8px;">
                <div class="party">
                    <div class="party-label">{{ $isDelivery ? 'Livré à' : 'Client' }}</div>
                    <div class="party-name">{{ $document->customer_name ?: 'Client de passage' }}</div>
                    @if ($document->customer_phone)
                        <div>Tél. {{ $document->customer_phone }}</div>
                    @endif
                    @if ($document->customer_address)
                        <div>{{ $document->customer_address }}</div>
                    @endif
                </div>
            </td>
            <td style="width: 50%; padding-left: 8px; text-align: right;">
                @if ($document->status->value === 'paye')
                    <span class="stamp">Payé</span>
                @elseif ($document->status->value === 'annule')
                    <span class="stamp stamp-danger">Annulé</span>
                @elseif ($document->status->value === 'livre')
                    <span class="stamp">Livré</span>
                @elseif ($document->status->value === 'accepte')
                    <span class="stamp">Accepté</span>
                @endif
            </td>
        </tr>
    </table>

    <table class="items">
        <thead>
            <tr>
                <th style="width: 46%;">Désignation</th>
                <th class="num" style="width: 10%;">Qté</th>
                @unless ($isDelivery)
                    <th class="num" style="width: 16%;">Prix unitaire</th>
                    <th class="num" style="width: 12%;">Remise</th>
                    <th class="num" style="width: 16%;">Total</th>
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
                            <div class="sku">Réf. {{ $item->variant->sku }}</div>
                        @endif
                    </td>
                    <td class="num">{{ $item->quantity }}</td>
                    @unless ($isDelivery)
                        <td class="num">{{ Money::format($item->unit_price, false) }}</td>
                        <td class="num">{{ $item->discount > 0 ? '−'.Money::format($item->discount, false) : '—' }}</td>
                        <td class="num">{{ Money::format($item->line_total, false) }}</td>
                    @endunless
                </tr>
            @endforeach
        </tbody>
    </table>

    @unless ($isDelivery)
        <table class="totals">
            <tr>
                <td></td>
                <td class="label">Sous-total</td>
                <td class="value">{{ Money::format($document->subtotal, false) }}</td>
            </tr>
            @if ($document->discount > 0)
                <tr>
                    <td></td>
                    <td class="label">Remise globale</td>
                    <td class="value">−{{ Money::format($document->discount, false) }}</td>
                </tr>
            @endif
            @if ($document->tax_amount > 0)
                <tr>
                    <td></td>
                    <td class="label">{{ $taxLabel }} ({{ rtrim(rtrim(number_format((float) $document->tax_rate, 2, ',', ' '), '0'), ',') }} %)</td>
                    <td class="value">{{ Money::format($document->tax_amount, false) }}</td>
                </tr>
            @endif
            <tr class="grand">
                <td></td>
                <td class="label">Total à payer</td>
                <td class="value">{{ Money::format($document->total) }}</td>
            </tr>
            @if ($document->amount_paid > 0)
                <tr>
                    <td></td>
                    <td class="label">Déjà réglé</td>
                    <td class="value">{{ Money::format($document->amount_paid, false) }}</td>
                </tr>
                @if ($document->balance_due > 0)
                    <tr class="due">
                        <td></td>
                        <td class="label">Reste à payer</td>
                        <td class="value">{{ Money::format($document->balance_due) }}</td>
                    </tr>
                @endif
            @endif
        </table>
    @else
        <table class="totals">
            <tr>
                <td></td>
                <td class="label">Nombre total d'articles</td>
                <td class="value">{{ $document->items->sum('quantity') }}</td>
            </tr>
        </table>
    @endunless

    @if ($document->notes)
        <div class="notes">
            <div class="notes-title">Note</div>
            {{ $document->notes }}
        </div>
    @endif

    @if ($document->terms)
        <div class="notes">
            <div class="notes-title">Conditions</div>
            {{ $document->terms }}
        </div>
    @endif

    <table class="signature">
        <tr>
            <td style="width: 50%;">
                <div class="signature-box">{{ $isDelivery ? 'Signature du client (reçu)' : 'Le client' }}</div>
            </td>
            <td style="width: 50%; text-align: right;">
                <div class="signature-box" style="margin-left: auto;">Pour {{ $shop['name'] }}</div>
            </td>
        </tr>
    </table>

    <div class="footer">
        {{ $shop['name'] }} — {{ $type->label() }} {{ $document->reference }}
        @if ($document->user) · établi par {{ $document->user->name }} @endif
    </div>

    @unless ($isPdf)
        <div class="actions">
            <button type="button" onclick="window.print()">Imprimer</button>
        </div>
        <script>
            window.addEventListener('load', () => window.print());
        </script>
    @endunless
</body>
</html>
