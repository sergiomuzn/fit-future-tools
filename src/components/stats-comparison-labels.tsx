import { isValidElement, type ReactElement } from "react";

type ChartPoint = { x?: number; y?: number; value?: number | string | null };
type ChartItem = {
  item?: ReactElement<{ dataKey?: string }>;
  props?: { points?: ChartPoint[] };
};

type ComparisonLabelsProps = {
  formattedGraphicalItems?: ChartItem[];
  offset?: { top: number; height: number };
  seriesKeys: string[];
  colors: string[];
};

// Render after every curve so no later series can cover another month's label.
export function StatsComparisonLabels({ formattedGraphicalItems = [], offset, seriesKeys, colors }: ComparisonLabelsProps) {
  const series = seriesKeys.map((key, index) => ({
    key,
    color: colors[index],
    points: formattedGraphicalItems.find(({ item }) =>
      isValidElement(item) && item.props.dataKey === key)?.props?.points ?? [],
  }));
  const count = Math.max(0, ...series.map(({ points }) => points.length));
  const top = (offset?.top ?? 0) + 7;
  const bottom = (offset?.top ?? 0) + (offset?.height ?? 300) - 7;

  return (
    <g className="stats-comparison-labels" pointerEvents="none">
      {Array.from({ length: count }, (_, index) => {
        const labels = series.flatMap(({ key, color, points }) => {
          const point = points[index];
          if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.value == null) return [];
          return [{ key, color, x: Number(point.x), pointY: Number(point.y), y: Number(point.y) - 13, value: point.value }];
        }).sort((a, b) => a.pointY - b.pointY);

        // Maintain the curves' vertical order, including equal values, with a
        // full text-line gap. Keep zero and peak labels within the plot too.
        const gap = 18;
        labels.forEach((label, i) => {
          label.y = Math.max(top, label.y, i > 0 ? labels[i - 1].y + gap : top);
        });
        for (let i = labels.length - 1; i >= 0; i--) {
          labels[i].y = Math.min(labels[i].y, i === labels.length - 1 ? bottom : labels[i + 1].y - gap);
        }

        return labels.map((label) => (
          <text
            key={`${index}-${label.key}`}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill={label.color}
            stroke="var(--color-card)"
            strokeWidth={5}
            strokeLinejoin="round"
            paintOrder="stroke"
            fontSize={11}
            fontWeight={600}
            aria-label={`${label.key}: ${label.value}`}
          >
            {label.value}
          </text>
        ));
      })}
    </g>
  );
}