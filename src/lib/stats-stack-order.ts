// Stacked bars must always read "most at the bottom, least at the top".
// Recharts fixes one series order per chart, so the only way to get that
// ordering inside every bar is to render generic rank slots whose value and
// colour are resolved per bar.

type StackRow = { bucket: string; [key: string]: string | number };

export type RankedStack = {
  /** original rows plus one numeric field per rank slot */
  rows: StackRow[];
  /** rank slot keys, in render order (first = bottom of the stack) */
  barKeys: string[];
  /** rank slot key -> Recharts stackId */
  barStackMap: Record<string, string>;
  /** per row (same index as rows): real series name of each rank slot */
  stackOrder: string[][];
};

export function rankStackRows(
  rows: StackRow[],
  seriesKeys: string[],
  stackMap: Record<string, string>,
): RankedStack | null {
  // Group the series that share a stack, keeping the caller's order.
  const groups = new Map<string, string[]>();
  for (const key of seriesKeys) {
    const stackId = stackMap[key];
    if (!stackId) continue;
    const list = groups.get(stackId);
    if (list) list.push(key);
    else groups.set(stackId, [key]);
  }
  const stacked = [...groups.entries()].filter(([, keys]) => keys.length > 1);
  if (!stacked.length) return null;

  // Totals and original position only break ties, so equal bars stay stable.
  const totals = new Map<string, number>();
  for (const key of seriesKeys) {
    totals.set(key, rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0));
  }
  const position = new Map(seriesKeys.map((key, index) => [key, index]));

  const barKeys: string[] = [];
  const barStackMap: Record<string, string> = {};
  const rankKeys = new Map<string, string[]>();
  for (const [stackId, keys] of stacked) {
    const slots = keys.map(() => {
      const slot = `__stack${barKeys.length}`;
      barKeys.push(slot);
      barStackMap[slot] = stackId;
      return slot;
    });
    rankKeys.set(stackId, slots);
  }

  const outRows: StackRow[] = [];
  const stackOrder: string[][] = [];
  for (const row of rows) {
    const next: StackRow = { ...row };
    const order: string[] = [];
    for (const [stackId, keys] of stacked) {
      const sorted = [...keys].sort((a, b) =>
        (Number(row[b]) || 0) - (Number(row[a]) || 0) ||
        (totals.get(b) ?? 0) - (totals.get(a) ?? 0) ||
        (position.get(a) ?? 0) - (position.get(b) ?? 0),
      );
      rankKeys.get(stackId)!.forEach((slot, rank) => {
        next[slot] = Number(row[sorted[rank]]) || 0;
        order.push(sorted[rank]);
      });
    }
    outRows.push(next);
    stackOrder.push(order);
  }

  return { rows: outRows, barKeys, barStackMap, stackOrder };
}

/**
 * Adds the per-bar rank slots to a chart result that stacks series.
 * Results without a multi-series stack are returned untouched.
 */
export function applyStackRank<T extends {
  rows: StackRow[];
  seriesKeys: string[];
  stackMap?: Record<string, string>;
}>(result: T): T & Partial<RankedStack> {
  if (!result.stackMap) return result;
  const ranked = rankStackRows(result.rows, result.seriesKeys, result.stackMap);
  if (!ranked) return result;
  return { ...result, ...ranked };
}
