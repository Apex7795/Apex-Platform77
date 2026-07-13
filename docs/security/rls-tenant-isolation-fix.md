# Security Design Proposal: Fixing Row-Level Security Tenant Isolation

**Status:** Proposed, not yet implemented. No production code has been changed as part of this document.
**Severity:** Critical (confirmed cross-tenant data exposure) with a critical operational trade-off (naive fix breaks live Twilio flows).

## Summary

Row-Level Security (RLS) on `users`, `landing_pages`, `tracking_numbers`, `leads`, and `ad_campaigns` is currently non-functional. Every query — whether or not it goes through `lib/db.js`'s `runWithTenant` tenant-scoping helper — can read and write every tenant's data. This was verified empirically against a live Postgres instance, not inferred from reading the SQL. The fix is straightforward in isolation, but three Twilio webhook routes depend on querying these same tables *before* a tenant is known, and a naive fix breaks all three. This document proposes a hybrid design that closes the leak without breaking those flows, and asks for sign-off before implementation.

## The vulnerability, confirmed empirically

Seeded a fresh test database with two tenants and one `leads` row each, using `apex_test` — the same role that ran the migration, standing in for the app's single `DATABASE_URL` connection (this repo defines no separate database role anywhere).

1. Unscoped query, no tenant context set at all:
   ```sql
   SELECT tenant_id, caller_number FROM leads;
   -- returned BOTH tenants' rows
   ```
2. Scoped query, using the exact mechanism `runWithTenant` uses (`set_config('app.current_tenant_id', ...)`), correctly set to Tenant A:
   ```sql
   SELECT set_config('app.current_tenant_id', '<tenant-A-id>', true);
   SELECT tenant_id, caller_number FROM leads;
   -- still returned Tenant B's row
   ```

**Root cause:** Postgres exempts a table's owner from its own RLS policies unless `FORCE ROW LEVEL SECURITY` is set, which was never done. Since the app almost certainly connects as the migration-owning role (one `DATABASE_URL`, no other role defined anywhere in the repo), RLS has been inert since it was introduced — not a bug in any individual route, a bug in the enforcement mechanism itself.

**Confirmed as an ownership issue, not a broken policy:** re-ran the identical test as a newly created non-owner role (`apex_app_user`, granted plain `SELECT/INSERT/UPDATE/DELETE`, no ownership) with no other changes:
- Unscoped: 0 rows.
- Scoped to Tenant A: exactly Tenant A's row.
- Scoped to Tenant B: exactly Tenant B's row.

The policies themselves (`USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID)`) are correct. Enforcement is the only thing missing.

## Why the obvious fix isn't safe to ship as-is

Adding `FORCE ROW LEVEL SECURITY` (or switching the app to the non-owner role above, which has the same effect) closes the leak — verified. But three Twilio webhook routes run a query against one of these tables *before any tenant is known*, because determining the tenant is the entire purpose of the query:

| Route | Query | Purpose |
|---|---|---|
| `app/api/twilio/voice/route.js` | `SELECT tenant_id, forwards_to FROM tracking_numbers WHERE phone_number = $1` | Route an inbound call to the right business |
| `app/api/twilio/sms-inbound/route.js` | `SELECT tenant_id FROM leads WHERE caller_number = $1` | Resolve who a STOP/opt-out SMS belongs to |
| `app/api/twilio/recording-status/route.js` | `SELECT tenant_id FROM leads WHERE call_sid = $1` | Attach a finished call recording to the right lead |

With RLS actually enforced, all three return zero rows unconditionally, because there is no session tenant context yet to satisfy the policy. The result: every inbound call gets "this number is no longer in service," every SMS opt-out silently stops being recorded (while the customer is still told they're unsubscribed), and call recordings never get linked to leads again — all silently, no errors, no exceptions. That's trading a silent data leak for a silent near-outage of the phone system, and is not an acceptable naive fix.

## Proposed design: hybrid isolation

**1. Move the app to a dedicated, non-owner database role.**
Preferred over `FORCE ROW LEVEL SECURITY` on the owner role because it's the standard Postgres RLS deployment pattern and cleanly separates migration/admin access (owner role, used only for running `db/migrate_combined.sql` etc.) from runtime application access (new role, subject to RLS by default with no special-casing needed). Requires: a `CREATE ROLE` + `GRANT` step added to the migration, a second connection string, and `lib/db.js` updated to use it for the app/worker's `DATABASE_URL` while migrations continue to run as the owner.

*(Alternative: `FORCE ROW LEVEL SECURITY` on the existing owner role is a smaller diff and needs no new connection string, at the cost of a less conventional setup and applying RLS to every connection using that role, including any future ad hoc admin/maintenance scripts run against the same `DATABASE_URL`. Noting this as the fallback if standing up a second role is out of scope right now.)*

**2. Treat `tracking_numbers` as a public routing table — do not enable RLS on it at all.**
Its rows map a phone number to a tenant ID and a forward-to number; by construction, this table must be queryable with no tenant context, since resolving the tenant *is* the lookup. This isn't a security compromise as long as the columns returned stay minimal (already true — the route only selects `tenant_id, forwards_to`). Simplest correct answer: remove `ALTER TABLE tracking_numbers ENABLE ROW LEVEL SECURITY` and its policy, or leave it enabled but add an explicit permissive `USING (true)` `SELECT`-only policy documenting the intent, whichever the team prefers for auditability.

**3. Add narrow `SECURITY DEFINER` functions for the two `leads` bootstrap lookups.**
`leads` is the one table here holding actual customer conversation/call data, so it should stay under strict RLS with no blanket carve-out. Instead, expose exactly the two lookups these webhooks need, nothing more:

```sql
-- Runs with the owning role's privileges (bypasses RLS internally), but
-- returns only a tenant_id — never a row, never any other column. Even
-- full knowledge of this function's existence and a webhook payload gives
-- an attacker nothing beyond "does a call_sid/caller_number exist and
-- which tenant does it belong to," which the routes already leak via
-- their response behavior today.
CREATE OR REPLACE FUNCTION get_tenant_for_call_sid(p_call_sid text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM leads WHERE call_sid = p_call_sid LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_tenant_for_caller_number(p_caller_number text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM leads
  WHERE caller_number = p_caller_number
  ORDER BY created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_tenant_for_call_sid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_tenant_for_caller_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tenant_for_call_sid(text) TO apex_app_user;
GRANT EXECUTE ON FUNCTION get_tenant_for_caller_number(text) TO apex_app_user;
```

**`SET search_path = public, pg_temp` is required, not optional — a `SECURITY DEFINER` function without a pinned search path is a well-known local privilege-escalation vector** (a caller could otherwise shadow a table/function in a schema earlier in their own search path, and have the definer-privileged function execute attacker-controlled code). This is the single most important line in this proposal's SQL — do not drop it in implementation. `STABLE` documents that these are read-only within a transaction, which is also correct and helps the planner.

Route changes (mechanical, once the functions exist):
```js
// recording-status/route.js — was:
const { rows } = await query('SELECT tenant_id FROM leads WHERE call_sid = $1', [CallSid]);
// becomes:
const { rows } = await query('SELECT get_tenant_for_call_sid($1) AS tenant_id', [CallSid]);
```
(same shape for `sms-inbound/route.js` with `get_tenant_for_caller_number`).

**4. Everywhere else** — every route already using `runWithTenant` once a tenant is established — no change needed. Strict RLS via the fixed enforcement mechanism (role or `FORCE`) now actually applies, closing the leak for `users`, `landing_pages`, `leads`, and `ad_campaigns` business queries.

## Open decisions for sign-off

1. Non-owner app role vs. `FORCE ROW LEVEL SECURITY` on the existing role — the former is recommended but is more work (new role, new connection string, `lib/db.js` change).
2. `tracking_numbers`: drop RLS entirely, or keep it enabled with an explicit `USING (true)` policy for documentation purposes — functionally identical, differs only in whether the "this table is intentionally public" decision is self-documenting in the schema.
3. Whether `get_tenant_for_call_sid`/`get_tenant_for_caller_number` should also be granted to a future non-web caller (e.g. the `scripts/cron.js` worker, if any job ever needs the same bootstrap pattern) or scoped tightly to just the web app role.

## Verification plan once implemented

Repeat the exact empirical test from this document (two tenants, one lead each) against the new role/policy configuration:
- Confirm unscoped queries against `leads`/`users`/`landing_pages`/`ad_campaigns` return 0 rows.
- Confirm tenant-scoped queries return only that tenant's rows.
- Confirm `tracking_numbers` lookups by phone number still resolve without tenant context.
- Confirm `get_tenant_for_call_sid`/`get_tenant_for_caller_number` return a bare `tenant_id` for a matching row and `NULL` for no match, and that calling them as a role without `EXECUTE` grant fails.
- Re-run the three Twilio webhook routes end-to-end (or with mocked Twilio signatures) against a seeded lead to confirm call routing, opt-out recording, and recording-URL linkage all still work.
