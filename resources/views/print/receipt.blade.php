@php use App\Support\Money; @endphp
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Ticket {{ $sale->reference }}</title>
    <style>
        /* Largeur calée sur les imprimantes thermiques 80 mm. */
        @page { size: 80mm auto; margin: 0; }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            padding: 6mm 4mm;
            width: 80mm;
            font-family: "DejaVu Sans Mono", "Courier New", monospace;
            font-size: 11px;
            line-height: 1.45;
            color: #000;
            background: #fff;
        }

        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .shop { font-size: 17px; font-weight: bold; letter-spacing: 1px; }
        .muted { font-size: 10px; }

        hr {
            border: 0;
            border-top: 1px dashed #000;
            margin: 6px 0;
        }

        table { width: 100%; border-collapse: collapse; }
        td { padding: 1px 0; vertical-align: top; }
        .qty { width: 26px; }
        .amount { width: 68px; text-align: right; white-space: nowrap; }
        .total-row td { font-size: 14px; font-weight: bold; padding-top: 4px; }
        .item-name { word-break: break-word; }

        .actions { margin-top: 12px; text-align: center; }
        .actions button {
            font: inherit;
            padding: 6px 14px;
            cursor: pointer;
        }

        @media print {
            .actions { display: none; }
        }
    </style>
</head>
<body>
    <div class="center">
        <div class="shop">{{ $shop['name'] }}</div>
        @if ($shop['address'])
            <div class="muted">{{ $shop['address'] }}</div>
        @endif
        @if ($shop['phone'])
            <div class="muted">Tél. {{ $shop['phone'] }}</div>
        @endif
    </div>

    <hr>

    <table>
        <tr>
            <td>Ticket</td>
            <td class="right bold">{{ $sale->reference }}</td>
        </tr>
        <tr>
            <td>Date</td>
            <td class="right">{{ $sale->sold_at?->format('d/m/Y H:i') }}</td>
        </tr>
        @if ($sale->user)
            <tr>
                <td>Vendeur</td>
                <td class="right">{{ $sale->user->name }}</td>
            </tr>
        @endif
        @if ($sale->customer)
            <tr>
                <td>Client</td>
                <td class="right">{{ $sale->customer->displayName() }}</td>
            </tr>
        @endif
    </table>

    <hr>

    <table>
        @foreach ($sale->items as $item)
            <tr>
                <td colspan="3" class="item-name">{{ $item->designation }}</td>
            </tr>
            <tr>
                <td class="qty">{{ $item->quantity }} ×</td>
                <td>{{ Money::format($item->unit_price, false) }}</td>
                <td class="amount">{{ Money::format($item->line_total, false) }}</td>
            </tr>
            @if ($item->discount > 0)
                <tr>
                    <td colspan="2" class="muted">&nbsp;&nbsp;remise</td>
                    <td class="amount muted">−{{ Money::format($item->discount, false) }}</td>
                </tr>
            @endif
        @endforeach
    </table>

    <hr>

    <table>
        <tr>
            <td>Sous-total</td>
            <td class="amount">{{ Money::format($sale->subtotal, false) }}</td>
        </tr>
        @if ($sale->discount > 0)
            <tr>
                <td>Remise</td>
                <td class="amount">−{{ Money::format($sale->discount, false) }}</td>
            </tr>
        @endif
        <tr class="total-row">
            <td>TOTAL</td>
            <td class="amount">{{ Money::format($sale->total) }}</td>
        </tr>
        <tr>
            <td>{{ $sale->payment_method->label() }}</td>
            <td class="amount">{{ Money::format($sale->amount_paid, false) }}</td>
        </tr>
        @if ($sale->change_due > 0)
            <tr>
                <td>Monnaie rendue</td>
                <td class="amount">{{ Money::format($sale->change_due, false) }}</td>
            </tr>
        @endif
    </table>

    @if ($sale->status->value !== 'validee')
        <hr>
        <div class="center bold">*** {{ strtoupper($sale->status->label()) }} ***</div>
    @endif

    <hr>

    <div class="center muted">
        {{ $shop['footer'] ?: 'Merci de votre visite' }}
        <div style="margin-top: 4px;">Marchandise vendue non reprise, ni échangée.</div>
    </div>

    <div class="actions">
        <button type="button" onclick="window.print()">Imprimer</button>
    </div>

    <script>
        // Ouverture directe de la boîte d'impression : le vendeur n'a qu'à valider.
        window.addEventListener('load', () => window.print());
    </script>
</body>
</html>
