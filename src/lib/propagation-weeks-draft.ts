/** Follow loaded settings until the user explicitly edits the local draft. */
export function propagationWeeksDraft(draft: string | null, savedWeeks: number) {
  const input = draft ?? String(savedWeeks);
  const weeks = Math.min(12, Math.max(1, Number(input) || savedWeeks));
  return { input, weeks, changed: draft !== null && weeks !== savedWeeks };
}