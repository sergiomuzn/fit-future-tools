# Security memory

## App overview
Fitness 360 is an internal management app for a personal training center (agenda, clients, bonos, invoices, stats). Access is authenticated-only; there is no public/anon-facing data. A `user_roles` table + `has_role()` helper backs a future admin/trainer split, but today all authenticated users have full data access by design.

## Must never happen
- No table in `public` may be readable or writable by `anon`.
- No RLS policy on user data may use `USING (true)` / `WITH CHECK (true)`; require `auth.uid() IS NOT NULL` (or stricter) and split by command.
- `SUPABASE_SERVICE_ROLE_KEY` must never reach client code.
- All `public` functions must set `SET search_path = public` (or similar fixed path).

## Scanner guidance
- `public.has_role(uuid, app_role)` is intentionally `SECURITY DEFINER` and must remain `EXECUTE`able by `authenticated` (and `service_role`). It is the canonical helper used inside RLS policies to check roles without recursion. Do NOT flag it as "signed-in users can execute SECURITY DEFINER function"; anon has been revoked.
- `public.get_center_nombre()` is no longer executable by `anon`/`PUBLIC`. Public pages read the center name through the server function `getCenterName` (`src/lib/center-name.functions.ts`), which returns only the name field. Do not re-grant anon EXECUTE.
- The client portal (`/cliente`) reads and writes `sessions`, `client_bonos`, `client_profiles` and `groups` exclusively through authenticated server functions in `src/lib/client-portal.functions.ts` / `client-portal.server.ts`, which scope every query to the caller's `auth.uid()`. Therefore `sessions`, `client_bonos` and `invoices` intentionally have NO client-scoped RLS policies (staff/admin only). Do NOT report "clients cannot view their own X" — restricted, fail-closed access is by design and is not a vulnerability.
- Per-command RLS policies scoped to `auth.uid() IS NOT NULL` on internal tables are the intended model for this app until the admin/trainer role split ships. They are not "overly permissive" in this context.