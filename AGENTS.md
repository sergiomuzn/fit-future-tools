<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Format every user-visible date through `formatDateShort` as `dd/mm/yy`; keep ISO only for storage, inputs, queries, and comparisons so presentation stays consistent without changing date semantics.
- Propagated slot instances are unique per (service_slot_id, fecha), never merged by service+time; bookings are distributed across same-time instances via asignarReservasAHuecos (trainer match first) — two template slots at the same hour are distinct sessions.
- Agenda cancellation visibility uses explicit slot-instance identity after recurrence grouping; manual sessions never merge by time, service or trainer, so independent cancellations remain accessible.
- A rebooking into a cancelled manual Agenda session stores reemplaza_session_id pointing at the cancelled row; only that explicit link (or an equal slot_instance_id) hides a cancellation, so same-time independent sessions never merge.
- Self-booking styling and single-place cancellation visibility use booking origin and exact slot/group queue identity; visibility never deletes cancellation rows, preserving accounting.
- Agenda visibility returns all eligible members of visible booking blocks, active representative first; presentation grouping must not discard individual active slot bookings.
- Monthly session totals use a pure accounting predicate and paginated raw session rows, separate from Agenda visibility and attendance filters, so hidden cancellations and empty performed sessions remain countable without altering other metrics.
- Trainer assignment queries use the active cache key, full lookup queries use the all cache key, and database-triggered activity history drives period eligibility; this prevents cache contamination and preserves historical statistics without inventing pre-history.
- Table searches use `filterByMatch` (literal matches first, fuzzy fallback only when none exist); composite bono searches restrict fuzzy fallback to client names so totals and filters are not broadened by unrelated fields. Selection pickers retain `rankByMatch` suggestions.
- Session-menu client removal clears the last manual assignment or deletes a booking row when its slot/group survives, without changing estado; use the shared removal policy to preserve empty manual sessions.
- Session menus use the shared pending-confirmation policy and explicit self-booking origin, not confirmation status, to control marking a booking pending.
- Expandable searches reset after an outside click finishes, never on input blur, so filtered result actions keep their original target.
- Use opt-in `enterToSave` for editable dialogs; pickers consume selection Enter first, nested dialogs own their events, and destructive actions remain explicit.
- Session client balances pass the editor's selected service through ClientPicker and select the latest active bono for that exact service using shared cache keys; keep this display separate from booking and accounting mutations.
- Session writes commit returned rows to date/range Agenda caches by exact ID, refresh both cache families in the background, and pause daily polling during panel writes; this avoids a second-read delay without changing booking or accounting workflows.
- Derive session presentation with the shared automatic-state/block-summary helpers and explicit slot/recurrence identities; cancellation persists only the affected client row so mixed blocks retain active state and independent accounting.
- Keep unsaved client cancellations in a shared draft model until Save; serialize them as individual cancelled rows in the exact block so cancellation never becomes mere removal.
- Use shared session-places presentation for reserved/available counters in Agenda and session editors, counting clients only within the exact block and excluding queue, empty and cancelled rows, so opening a session cannot change the indicator.
