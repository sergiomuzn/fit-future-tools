import type { KeyboardEvent } from "react";

/**
 * Returns an onKeyDown handler that invokes `save()` when the user presses
 * Enter inside a dialog/form. Ignores Enter inside textareas, buttons, and
 * open comboboxes/selects, and ignores Enter with modifier keys.
 */
export function enterToSave(save: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.isDefaultPrevented()) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const tag = t.tagName;
    if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;
    if (t.isContentEditable) return;
    const role = t.getAttribute("role");
    if (role === "combobox" || role === "option" || role === "menuitem") return;
    if (t.closest('[role="listbox"], [role="menu"], [role="dialog"][data-state="open"] [aria-expanded="true"]')) {
      // let the open popover handle Enter
      if (t.closest('[role="listbox"], [role="menu"]')) return;
    }
    e.preventDefault();
    save();
  };
}
