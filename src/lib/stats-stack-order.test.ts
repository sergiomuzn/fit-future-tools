import { test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { applyStackRank, rankStackRows } from "./stats-stack-order";

const rows = [
  { bucket: "Mañana", MM: 94, SM: 2, PL: 81 },
  { bucket: "Tarde", MM: 10, SM: 109, PL: 4 },
];
const stackMap = { MM: "ent", SM: "ent", PL: "ent" };

test("each bar stacks its biggest series at the bottom", () => {
  const ranked = rankStackRows(rows, ["MM", "SM", "PL"], stackMap)!;
  deepStrictEqual(ranked.stackOrder, [
    ["MM", "PL", "SM"],
    ["SM", "MM", "PL"],
  ]);
  strictEqual(ranked.barKeys.length, 3);
  strictEqual(ranked.rows[0][ranked.barKeys[0]], 94);
  strictEqual(ranked.rows[0][ranked.barKeys[1]], 81);
  strictEqual(ranked.rows[0][ranked.barKeys[2]], 2);
  strictEqual(ranked.rows[1][ranked.barKeys[0]], 109);
  strictEqual(ranked.rows[1][ranked.barKeys[1]], 10);
  strictEqual(ranked.rows[1][ranked.barKeys[2]], 4);
});

test("rank slots keep the real values available and share one stackId", () => {
  const ranked = rankStackRows(rows, ["MM", "SM", "PL"], stackMap)!;
  for (const key of ranked.barKeys) strictEqual(ranked.barStackMap[key], "ent");
  strictEqual(ranked.rows[1].MM, 10);
  strictEqual(ranked.rows[1].SM, 109);
});

test("a single-series stack is left as separate bars", () => {
  strictEqual(rankStackRows([{ bucket: "Total", MM: 3 }], ["MM"], { MM: "ent" }), null);
  const result = { rows, seriesKeys: ["MM", "SM", "PL"], isLineChart: false };
  strictEqual(applyStackRank(result), result);
});

test("ties fall back to the chart total so the order is stable", () => {
  const tied = [
    { bucket: "A", X: 5, Y: 5 },
    { bucket: "B", X: 0, Y: 0 },
  ];
  const ranked = rankStackRows(tied, ["X", "Y"], { X: "s", Y: "s" })!;
  deepStrictEqual(ranked.stackOrder[0], ["X", "Y"]);
});
