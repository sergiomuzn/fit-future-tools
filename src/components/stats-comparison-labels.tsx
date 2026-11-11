import { isValidElement, type ReactElement } from "react";

type ChartPoint = { x?: number; y?: number; width?: number; height?: number; value?: number | string | number[] | null };
type ChartItem = {
  item?: ReactElement<{ dataKey?: string }>;
  props?: { points?: ChartPoint[]; data?: ChartPoint[] };
};
type YAxisInfo = { scale?: (v: number) => number; niceTicks?: number[]; ticks?: number[] };

type ComparisonLabelsProps = {
  formattedGraphicalItems?: ChartItem[];
  offset?: { top: number; height: number; left?: number };
  yAxisMap?: Record<string, YAxisInfo>;
  seriesKeys: string[];
  colors: string[];
  labelEvery?: number;
  bars?: boolean;
  leftLabels?: boolean;
};

const FONT = 11;
const LABEL_H = 13;
const labelWidth = (value: unknown) => String(value).length * 6.8 + 4;

// Does a polyline segment cross the label's bounding box? (Liang–Barsky clip)
function segmentHitsBox(x1: number, y1: number, x2: number, y2: number, l: number, t: number, r: number, b: number) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const edges: Array<[number, number]> = [[-dx, x1 - l], [dx, r - x1], [-dy, y1 - t], [dy, b - y1]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue; }
    const v = q / p;
    if (p < 0) { if (v > t1) return false; if (v > t0) t0 = v; }
    else { if (v < t0) return false; if (v < t1) t1 = v; }
  }
  return true;
}

// Render after every curve so no later series can cover another month's label.
export function StatsComparisonLabels({ formattedGraphicalItems = [], offset, yAxisMap, seriesKeys, colors, labelEvery = 1, bars = false, leftLabels = false }: ComparisonLabelsProps) {
  const series = seriesKeys.map((key, index) => {
    const graphical = formattedGraphicalItems.find(({ item }) =>
      isValidElement(item) && item.props.dataKey === key)?.props;
    return {
    key,
    color: colors[index],
    points: graphical?.points ?? graphical?.data ?? [],
  };
  });
  const count = leftLabels ? 1 : Math.max(0, ...series.map(({ points }) => points.length));
  const top = (offset?.top ?? 0) + 7;
  const bottom = (offset?.top ?? 0) + (offset?.height ?? 300) - 7;

  // Y-axis tick label positions, so mean values never sit on top of them.
  const yAxis = yAxisMap ? Object.values(yAxisMap)[0] : undefined;
  const tickYs = yAxis?.scale
    ? (yAxis.niceTicks ?? yAxis.ticks ?? []).map((t) => Number(yAxis.scale!(t))).filter(Number.isFinite)
    : [];

  // Polylines of every plotted curve (lines only) for crossing detection.
  const curves = bars ? [] : series.map(({ points }) =>
    points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.value != null)
      .map((p) => [Number(p.x), Number(p.y)] as const));

  const crossesCurve = (x: number, y: number, w: number) => {
    const l = x - w / 2, r = x + w / 2, t = y - LABEL_H / 2, b = y + LABEL_H / 2;
    return curves.some((pts) => pts.some((p, i) => i > 0 && segmentHitsBox(pts[i - 1][0], pts[i - 1][1], p[0], p[1], l, t, r, b)));
  };

  return (
    <g className="stats-comparison-labels" pointerEvents="none">
      {Array.from({ length: count }, (_, index) => {
        if (index % labelEvery !== 0) return null;
        const labels = series.flatMap(({ key, color, points }) => {
          const point = points[index];
          if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.value == null) return [];
          const value = Array.isArray(point.value) ? point.value[1] - point.value[0] : point.value;
          if (bars && Number(value) === 0) return [];
          return [{ key, color, x: (leftLabels ? (offset?.left ?? Number(point.x)) - 9 : Number(point.x) + ( bars ? (point.width ?? 0) / 2 : 0)), pointY: Number(point.y), y: Number(point.y) - 13, value }];
        }).sort((a, b) => a.pointY - b.pointY);

        if (leftLabels) {
          // Mean values sit on the axis: keep them on their line unless a tick
          // label is at the same height; then go just above/below that tick,
          // on the same side as the mean line.
          labels.forEach((label) => {
            label.y = label.pointY;
            for (const ty of tickYs) {
              if (Math.abs(label.y - ty) < LABEL_H) {
                label.y = label.pointY > ty ? ty + LABEL_H : ty - LABEL_H;
              }
            }
          });
          labels.sort((a, b) => a.y - b.y);
        }

        // Maintain the curves' vertical order, including equal values, with a
        // full text-line gap. Keep zero and peak labels within the plot too.
        const gap = leftLabels ? LABEL_H + 1 : 18;
        labels.forEach((label, i) => {
          label.y = Math.max(top, label.y, i > 0 ? labels[i - 1].y + gap : top);
        });
        for (let i = labels.length - 1; i >= 0; i--) {
          labels[i].y = Math.min(labels[i].y, i === labels.length - 1 ? bottom : labels[i + 1].y - gap);
        }

        return labels.map((label) => {
          const w = labelWidth(label.value);
          // Where a curve crosses the number, interrupt it behind the label.
          const cut = !leftLabels && !bars && crossesCurve(label.x, label.y, w);
          return (
          <g key={`${index}-${label.key}`}>
          {cut && (
            <rect
              x={label.x - w / 2}
              y={label.y - LABEL_H / 2}
              width={w}
              height={LABEL_H}
              rx={3}
              fill="var(--color-card, var(--card))"
            />
          )}
          <text
            x={label.x}
            y={label.y}
            textAnchor={leftLabels ? "end" : "middle"}
            dominantBaseline="central"
            fill={label.color}
            stroke="none"
            fontSize={FONT}
            fontWeight={600}
            aria-label={`${leftLabels ? "Media " : ""}${label.key.replace("__media__", "")}: ${label.value}`}
          >
            {label.value}
          </text>
          </g>
          );
        });
      })}
    </g>
  );
}
