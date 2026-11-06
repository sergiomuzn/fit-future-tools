import { test } from "node:test";
import { strictEqual } from "node:assert";
import type { KeyboardEvent } from "react";
import { enterToSave, closedSelectEnterToSave } from "./enter-to-save";

function event(overrides: Record<string, unknown> = {}) {
  const dialog = {};
  const target = {
    tagName: "INPUT",
    getAttribute: () => null,
    closest: (selector: string) => selector === '[role="dialog"]' ? dialog : null,
  };
  return {
    key: "Enter", nativeEvent: { isComposing: false },
    target, currentTarget: target,
    isDefaultPrevented: () => false,
    preventDefault() {},
    ...overrides,
  } as unknown as KeyboardEvent<HTMLElement>;
}

test("Enter in a completed input saves once", () => {
  let saved = 0;
  enterToSave(() => saved++)(event());
  strictEqual(saved, 1);
});

test("a selection that consumed Enter does not also save", () => {
  let saved = 0;
  enterToSave(() => saved++)(event({ isDefaultPrevented: () => true }));
  strictEqual(saved, 0);
});

test("held Enter and composing text never trigger saves", () => {
  let saved = 0;
  const save = enterToSave(() => saved++);
  save(event({ repeat: true }));
  save(event({ nativeEvent: { isComposing: true } }));
  strictEqual(saved, 0);
});

test("Enter in a nested dialog cannot save the parent session", () => {
  let saved = 0;
  const e = event();
  e.currentTarget = { closest: () => ({}) } as unknown as HTMLElement;
  enterToSave(() => saved++)(e);
  strictEqual(saved, 0);
});

test("textareas and focused action buttons retain native Enter behavior", () => {
  for (const tagName of ["TEXTAREA", "BUTTON", "A"]) {
    let saved = 0;
    const e = event();
    Object.assign(e.target, { tagName });
    enterToSave(() => saved++)(e);
    strictEqual(saved, 0);
  }
});

test("closed select Enter saves but open select Enter selects only", () => {
  let saved = 0;
  const save = closedSelectEnterToSave(() => saved++);
  const e = event();
  Object.assign(e.target, { getAttribute: () => "true" });
  save(e);
  strictEqual(saved, 0);
  Object.assign(e.target, { getAttribute: () => "false" });
  save(e);
  strictEqual(saved, 1);
});