@php use App\Support\Money; @endphp
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Étiquettes — {{ $shopName }}</title>
    <style>
        @page {
            size: {{ $format['page'] }};
            margin: {{ $format['page'] === 'A4' ? '8mm' : '1mm' }};
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #fff;
            color: #000;
        }

        .toolbar {
            padding: 10px 14px;
            background: #f1f5f9;
            border-bottom: 1px solid #cbd5e1;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .toolbar button {
            font: inherit;
            padding: 6px 16px;
            cursor: pointer;
            border: 1px solid #1d4ed8;
            background: #1d4ed8;
            color: #fff;
            border-radius: 4px;
        }
        .toolbar .hint { color: #475569; }

        .sheet {
            display: flex;
            flex-wrap: wrap;
            align-content: flex-start;
            width: 100%;
            padding: {{ $format['page'] === 'A4' ? '2mm' : '0' }};
        }

        .label {
            width: {{ $format['width'] }}mm;
            height: {{ $format['height'] }}mm;
            padding: {{ $format['padding'] / 4 }}mm;
            overflow: hidden;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            /* Repère de découpe discret, invisible à l'impression si on
               l'enlève via la case « bordures ». */
            border: 0.1mm dashed #cbd5e1;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .label .name {
            font-size: {{ $format['width'] > 60 ? '8.5pt' : '6.5pt' }};
            font-weight: 600;
            line-height: 1.1;
            max-height: {{ $format['height'] > 30 ? '7mm' : '5mm' }};
            overflow: hidden;
            margin-bottom: 0.6mm;
        }

        .label .barcode { line-height: 0; }
        .label .barcode svg { max-width: 100%; height: auto; }

        .label .code {
            font-family: "Courier New", monospace;
            font-size: {{ $format['width'] > 60 ? '8pt' : '6pt' }};
            letter-spacing: 0.4px;
            margin-top: 0.4mm;
        }

        .label .price {
            font-size: {{ $format['width'] > 60 ? '12pt' : '9pt' }};
            font-weight: bold;
            margin-top: 0.6mm;
        }

        .label .missing {
            font-size: 7pt;
            color: #b91c1c;
        }

        .empty {
            padding: 40px;
            text-align: center;
            color: #64748b;
        }

        @media print {
            .toolbar { display: none; }
            .label.no-border { border: 0; }
        }
    </style>
</head>
<body>

    <div class="toolbar">
        <button type="button" onclick="window.print()">Imprimer</button>
        <label>
            <input type="checkbox" id="borders" checked> Repères de découpe
        </label>
        <span class="hint">
            {{ count($labels) }} étiquette{{ count($labels) > 1 ? 's' : '' }} —
            format {{ $format['label'] }}
        </span>
    </div>

    @if (count($labels) === 0)
        <div class="empty">Aucun article sélectionné.</div>
    @else
        <div class="sheet">
            @foreach ($labels as $label)
                <div class="label">
                    @if ($showName)
                        <div class="name">{{ $label['name'] }}</div>
                    @endif

                    @if ($label['svg'])
                        <div class="barcode">{!! $label['svg'] !!}</div>
                        <div class="code">{{ $label['readable'] }}</div>
                    @else
                        <div class="code">{{ $label['sku'] }}</div>
                        <div class="missing">Pas de code-barres</div>
                    @endif

                    @if ($showPrice)
                        <div class="price">{{ Money::format($label['price']) }}</div>
                    @endif
                </div>
            @endforeach
        </div>
    @endif

    <script>
        // Les repères de découpe aident à caler le papier, mais certains
        // préfèrent une planche propre : la case les retire avant impression.
        document.getElementById('borders').addEventListener('change', (event) => {
            document.querySelectorAll('.label').forEach((label) => {
                label.classList.toggle('no-border', !event.target.checked);
                label.style.border = event.target.checked ? '' : '0';
            });
        });
    </script>
</body>
</html>
