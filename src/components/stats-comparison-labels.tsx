import { isValidElement, type ReactElement } from "react";

type ChartPoint = { x?: number; y?: number; width?: number; height?: number; value?: number | string | number[] | null };
type ChartItem = {
  item?: ReactElement<{ dataKey?: string }>;
  props?: { points?: ChartPoint[]; data?: ChartPoint[] };
};

type ComparisonLabelsProps = {
  formattedGraphicalItems?: ChartItem[];
  offset?: { top: number; height: number };
  seriesKeys: string[];
  colors: string[];
  labelEvery?: number;
  bars?: boolean;
  leftLabels?: boolean;
};

// Render after every curve so no later series can cover another month's label.
export function StatsComparisonLabels({ formattedGraphicalItems = [], offset, seriesKeys, colors, labelEvery = 1, bars = false, leftLabels = false }: ComparisonLabelsProps) {
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

  return (
    <g className="stats-comparison-labels" pointerEvents="none">
      {Array.from({ length: count }, (_, index) => {
        if (index % labelEvery !== 0) return null;
        const labels = series.flatMap(({ key, color, points }) => {
          const point = points[index];
          if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.value == null) return [];
          const value = Array.isArray(point.value) ? point.value[1] - point.value[0] : point.value;
          if (bars && Number(value) === 0) return [];
          return [{ key, color, x: Number(point.x) + (leftLabels ? -70 : bars ? (point.width ?? 0) / 2 : 0), pointY: Number(point.y), y: Number(point.y) - (leftLabels ? 0 : 13), value }];
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
            textAnchor={leftLabels ? "end" : "middle"}
            dominantBaseline="central"
            fill={label.color}
            stroke="none"
            fontSize={11}
            fontWeight={600}
            aria-label={`${leftLabels ? "Media " : ""}${label.key.replace("__media__", "")}: ${label.value}`}
          >
            {label.value}
          </text>
        ));
      })}
    </g>
  );
}