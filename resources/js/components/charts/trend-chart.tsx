import { useId, useRef, useState } from 'react';
import { useElementWidth } from '@/hooks/use-element-width';
import { amount, count, money } from '@/lib/format';

export type TrendPoint = {
    date: string;
    label: string;
    fullLabel: string;
    revenue: number;
    margin: number | null;
    orders: number;
};

const PADDING = { top: 20, right: 16, bottom: 26, left: 60 };
const HEIGHT = 260;

/**
 * Chiffre d'affaires et marge sur la période.
 *
 * Les deux séries partagent le même axe — elles sont dans la même unité, le
 * franc. Un second axe donnerait deux échelles différentes sur un même dessin
 * et laisserait croire à des croisements qui n'existent pas.
 */
export function TrendChart({
    points,
    showMargin,
}: {
    points: TrendPoint[];
    showMargin: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const width = useElementWidth(containerRef);
    const [hovered, setHovered] = useState<number | null>(null);
    const gradientId = useId();

    if (points.length < 2) {
        return (
            <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                Pas encore assez de ventes pour tracer une courbe.
            </div>
        );
    }

    const plotWidth = Math.max(width - PADDING.left - PADDING.right, 10);
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const peak = Math.max(...points.map((point) => point.revenue), 0);
    const yMax = niceCeil(peak);
    const step = plotWidth / (points.length - 1);

    const ticks = dedupeTicks([0, yMax / 2, yMax]);

    const x = (index: number) => PADDING.left + index * step;
    const y = (value: number) =>
        PADDING.top + plotHeight - (yMax > 0 ? (value / yMax) * plotHeight : 0);

    const line = (pick: (point: TrendPoint) => number) =>
        points
            .map(
                (point, index) =>
                    `${index === 0 ? 'M' : 'L'}${x(index)},${y(pick(point))}`,
            )
            .join(' ');

    const revenuePath = line((point) => point.revenue);
    const marginPath = showMargin ? line((point) => point.margin ?? 0) : null;
    const areaPath = `${revenuePath} L${x(points.length - 1)},${PADDING.top + plotHeight} L${x(0)},${PADDING.top + plotHeight} Z`;

    // Une étiquette sur n pour que l'axe reste lisible sur 90 points comme sur 7.
    const labelEvery = Math.ceil(points.length / 8);
    const active = hovered !== null ? points[hovered] : null;

    // Change quand la période change : les tracés sont remontés, donc redessinés.
    const seriesKey = `${points[0].date}-${points[points.length - 1].date}`;

    function handleMove(event: React.MouseEvent<SVGSVGElement>) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const offset = event.clientX - bounds.left - PADDING.left;
        const index = Math.round(offset / step);

        setHovered(Math.min(Math.max(index, 0), points.length - 1));
    }

    return (
        <div ref={containerRef} className="relative">
            {width > 0 ? (
                <svg
                    width={width}
                    height={HEIGHT}
                    role="img"
                    aria-label={`Chiffre d'affaires sur ${points.length} points, sommet ${money(peak)}`}
                    onMouseMove={handleMove}
                    onMouseLeave={() => setHovered(null)}
                    className="touch-none"
                >
                    <defs>
                        <linearGradient
                            id={gradientId}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--viz-series-1)"
                                stopOpacity="0.13"
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--viz-series-1)"
                                stopOpacity="0.01"
                            />
                        </linearGradient>
                    </defs>

                    {ticks.map((tick) => (
                        <g key={tick.label}>
                            <line
                                x1={PADDING.left}
                                x2={width - PADDING.right}
                                y1={y(tick.value)}
                                y2={y(tick.value)}
                                stroke="var(--viz-grid)"
                                strokeWidth={1}
                            />
                            <text
                                x={PADDING.left - 10}
                                y={y(tick.value) + 4}
                                textAnchor="end"
                                className="fill-muted-foreground text-[11px] tabular-nums"
                            >
                                {tick.label}
                            </text>
                        </g>
                    ))}

                    {/* Le remplissage suit le tracé, il ne le précède pas */}
                    <path
                        key={`aire-${seriesKey}`}
                        d={areaPath}
                        fill={`url(#${gradientId})`}
                        className="anim-fondu"
                        style={{ animationDelay: '360ms' }}
                    />

                    {marginPath ? (
                        <path
                            key={`marge-${seriesKey}`}
                            d={marginPath}
                            fill="none"
                            stroke="var(--viz-series-2)"
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            pathLength={1}
                            className="anim-trace"
                            style={{ animationDelay: '120ms' }}
                        />
                    ) : null}

                    <path
                        key={`ca-${seriesKey}`}
                        d={revenuePath}
                        fill="none"
                        stroke="var(--viz-series-1)"
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        pathLength={1}
                        className="anim-trace"
                    />

                    {/* Le repère glisse d'un point à l'autre plutôt que de sauter */}
                    {hovered !== null ? (
                        <g className="animate-in fade-in-0 duration-150">
                            <line
                                x1={x(hovered)}
                                x2={x(hovered)}
                                y1={PADDING.top}
                                y2={PADDING.top + plotHeight}
                                stroke="var(--viz-axis)"
                                strokeWidth={1}
                                className="transition-[x1,x2] duration-100 ease-out"
                            />
                            {showMargin ? (
                                <circle
                                    cx={x(hovered)}
                                    cy={y(points[hovered].margin ?? 0)}
                                    r={5}
                                    fill="var(--viz-series-2)"
                                    stroke="var(--viz-surface)"
                                    strokeWidth={2}
                                    className="transition-[cx,cy] duration-100 ease-out"
                                />
                            ) : null}
                            <circle
                                cx={x(hovered)}
                                cy={y(points[hovered].revenue)}
                                r={5}
                                fill="var(--viz-series-1)"
                                stroke="var(--viz-surface)"
                                strokeWidth={2}
                                className="transition-[cx,cy] duration-100 ease-out"
                            />
                        </g>
                    ) : null}

                    {points.map((point, index) =>
                        index % labelEvery === 0 ||
                        index === points.length - 1 ? (
                            <text
                                key={point.date}
                                x={x(index)}
                                y={HEIGHT - 6}
                                textAnchor={
                                    index === 0
                                        ? 'start'
                                        : index === points.length - 1
                                          ? 'end'
                                          : 'middle'
                                }
                                className="fill-muted-foreground text-[11px]"
                            >
                                {point.label}
                            </text>
                        ) : null,
                    )}
                </svg>
            ) : (
                <div style={{ height: HEIGHT }} />
            )}

            {active ? (
                <div
                    className="pointer-events-none absolute top-2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md transition-[left] duration-100 ease-out animate-in fade-in-0 zoom-in-95"
                    style={{
                        left: Math.min(
                            Math.max(x(hovered ?? 0) - 80, 0),
                            Math.max(width - 170, 0),
                        ),
                    }}
                >
                    <p className="font-medium capitalize">{active.fullLabel}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-muted-foreground tabular-nums">
                        <span
                            aria-hidden
                            className="size-2 rounded-[2px]"
                            style={{ background: 'var(--viz-series-1)' }}
                        />
                        {money(active.revenue)}
                    </p>
                    {showMargin ? (
                        <p className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
                            <span
                                aria-hidden
                                className="size-2 rounded-[2px]"
                                style={{ background: 'var(--viz-series-2)' }}
                            />
                            {money(active.margin ?? 0)} de marge
                        </p>
                    ) : null}
                    <p className="text-muted-foreground tabular-nums">
                        {count(active.orders)} vente
                        {active.orders > 1 ? 's' : ''}
                    </p>
                </div>
            ) : null}
        </div>
    );
}

/** Retire les graduations qui s'afficheraient avec le même libellé. */
function dedupeTicks(
    values: number[],
): Array<{ value: number; label: string }> {
    const seen = new Set<string>();
    const ticks: Array<{ value: number; label: string }> = [];

    for (const value of values) {
        const label = amount(value);

        if (!seen.has(label)) {
            seen.add(label);
            ticks.push({ value, label });
        }
    }

    return ticks;
}

/** Arrondit vers le haut à une valeur « ronde » : 1, 2, 2.5, 5 ou 10 × 10ⁿ. */
function niceCeil(value: number): number {
    if (value <= 0) {
        return 1;
    }

    const exponent = Math.floor(Math.log10(value));
    const base = 10 ** exponent;
    const normalized = value / base;
    const nice =
        normalized <= 1
            ? 1
            : normalized <= 2
              ? 2
              : normalized <= 2.5
                ? 2.5
                : normalized <= 5
                  ? 5
                  : 10;

    return nice * base;
}
