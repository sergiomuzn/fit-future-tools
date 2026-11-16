import { isValidElement, type ReactElement } from "react";

type ChartPoint = { x?: number; y?: number; width?: number; height?: number; value?: number | string | number[] | null };
type ChartItem = {
  item?: ReactElement<{ dataKey?: string; stackId?: string }>;
  props?: { points?: ChartPoint[]; data?: ChartPoint[] };
};
type YAxisInfo = { scale?: (v: number) => number; niceTicks?: number[]; ticks?: number[] };

type ComparisonLabelsProps = {
  formattedGraphicalItems?: ChartItem[];
  offset?: { top: number; height: number; left?: number; width?: number };
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
      isValidElement(item) && item.props.dataKey === key);
    return {
    key,
    color: colors[index],
    stackId: graphical?.item?.props.stackId,
    points: graphical?.props?.points ?? graphical?.props?.data ?? [],
  };
  });
  const count = leftLabels ? 1 : Math.max(0, ...series.map(({ points }) => points.length));
  const top = (offset?.top ?? 0) + 7;
  const bottom = (offset?.top ?? 0) + (offset?.height ?? 300) - 7;

  // Y-axis tick label positions, so mean values never sit on top of them.
  const yAxis = yAxisMap ? Object.values(yAxisMap)[0] : undefined;
  const scale = yAxis?.scale;
  const tickYs = scale
    ? (yAxis?.niceTicks ?? yAxis?.ticks ?? []).map((t) => Number(scale(t))).filter(Number.isFinite)
    : [];

  // Bars must never use the line-label layout: its downward collision shifts
  // can put a number back inside its own bar. Group only actual stack members.
  if (bars) {
    const barLabels: Array<{ key: string; x: number; y: number; value: number; color: string }> = [];
    const segments: ReactElement[] = [];
    for (let index = 0; index < count; index++) {
      const stacks = new Map<string, { key: string; x: number; y: number; value: number; color: string }>();
      for (const { key, color, points, stackId } of series) {
        const point = points[index];
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        const value = Number(Array.isArray(point.value) ? point.value[1] - point.value[0] : point.value);
        if (!Number.isFinite(value) || value === 0) continue;
        const x = Number(point.x) + (point.width ?? 0) / 2;
        const y = Math.min(Number(point.y), Number(point.y) + (point.height ?? 0));
        const groupKey = `${index}-${stackId ?? key}`;
        const existing = stacks.get(groupKey);
        if (existing) {
          existing.value += value;
          existing.y = Math.min(existing.y, y - 13);
          existing.color = "var(--color-foreground)";
        } else {
          stacks.set(groupKey, { key: groupKey, x, y: y - 13, value, color });
        }
        const h = Math.abs(point.height ?? 0);
        if (stackId && h >= LABEL_H + 2) {
          segments.push(<text key={`${index}-${key}-segment`} x={x} y={y + h / 2}
            textAnchor="middle" dominantBaseline="central" fill={contrastText(color)}
            fontSize={FONT} fontWeight={700} aria-label={`${key}: ${value}`}>{value}</text>);
        }
      }
      barLabels.push(...stacks.values());
    }
    const placed: typeof barLabels = [];
    for (const label of barLabels.sort((a, b) => a.y - b.y)) {
      const w = labelWidth(label.value);
      if (offset?.left != null) {
        label.x = Math.max(label.x, offset.left + w / 2 + 4);
        if (offset.width != null) label.x = Math.min(label.x, offset.left + offset.width - w / 2 - 2);
      }
      // Only overlapping text boxes need spacing; always move upwards, never
      // down into a bar, and include labels from neighbouring X categories.
      while (placed.some((other) => Math.abs(other.x - label.x) < (labelWidth(other.value) + w) / 2 + 3 && Math.abs(other.y - label.y) < LABEL_H + 3)) {
        label.y -= LABEL_H + 3;
      }
      placed.push(label);
    }
    return <g className="stats-comparison-labels" pointerEvents="none">
      {segments}
      {placed.map((label) => <g key={label.key}>
        <rect x={label.x - labelWidth(label.value) / 2} y={label.y - LABEL_H / 2}
          width={labelWidth(label.value)} height={LABEL_H} rx={3} fill="var(--color-card, var(--card))" />
        <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central"
          fill={label.color} fontSize={FONT} fontWeight={700} aria-label={`Total: ${label.value}`}>{label.value}</text>
      </g>)}
    </g>;
  }

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
          // Keep data numbers fully inside the plot, clear of the Y axis line
          // and its tick values.
          if (!leftLabels && offset?.left != null) {
            label.x = Math.max(label.x, offset.left + w / 2 + 4);
            if (offset.width != null) label.x = Math.min(label.x, offset.left + offset.width - w / 2 - 2);
          }
          // Where a curve crosses the number, interrupt it behind the label.
          // Also covers mean lines and grid lines so the number stays legible.
          const cut = !leftLabels && !bars;
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

function contrastText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#111827";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111827" : "#ffffff";
}
