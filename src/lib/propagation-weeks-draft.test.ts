import { test } from "node:test";
import { deepStrictEqual } from "node:assert";
import { propagationWeeksDraft } from "./propagation-weeks-draft";

test("loading a saved four-week setting replaces the initial two-week fallback without a write", () => {
  deepStrictEqual(propagationWeeksDraft(null, 2), { input: "2", weeks: 2, changed: false });
  deepStrictEqual(propagationWeeksDraft(null, 4), { input: "4", weeks: 4, changed: false });
});

test("Propagar saves two weeks only when the user explicitly changes four to two", () => {
  deepStrictEqual(propagationWeeksDraft("2", 4), { input: "2", weeks: 2, changed: true });
});

test("a query refresh does not overwrite an edited four-week draft", () => {
  deepStrictEqual(propagationWeeksDraft("4", 3), { input: "4", weeks: 4, changed: true });
});

test("discarding an edit restores the saved four-week setting", () => {
  deepStrictEqual(propagationWeeksDraft(null, 4), { input: "4", weeks: 4, changed: false });
});