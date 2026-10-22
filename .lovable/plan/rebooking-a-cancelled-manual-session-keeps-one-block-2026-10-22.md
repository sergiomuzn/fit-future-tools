# Rebooking a cancelled manual session keeps one block

## Problem (confirmed)
A session created by hand in the Agenda has no link to a propagated slot. When its client cancels and a new client is booked into it from the session menu, a new row is inserted with no link to the cancelled one. The agenda then draws two blocks (cancelled + new) instead of one booked block with the old client under "Cancelados".

The old fix (matching by date + time + service) can't come back: it hid independent cancellations that just happened to share a time, which you asked to avoid.

## Fix
Link the new booking to the cancelled session explicitly, so only that exact cancellation is hidden.

1. Database: add an optional `reemplaza_session_id` (uuid, nullable, references sessions, on delete set null) to `sessions`.
2. Session menu (hueco-panel): when adding a client to a manual session whose block is a cancelled row, save `reemplaza_session_id` = that cancelled row's id on the new booking. The Cancelados tab for manual sessions lists cancellations linked this way (plus the block's own cancelled row) instead of matching by time.
3. Agenda (session-visibility): a cancelled row is hidden when an active row has the same slot (as today) OR an active row points to it through `reemplaza_session_id`. Nothing is matched by time, service or trainer.
4. Tests: add cases for "linked replacement hides its cancellation" and "unlinked same-time booking does not".

## Not changed
Bono deduction and "No contabilizar" for the cancelled client stay as they are.
