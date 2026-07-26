-- db/migrate_rls_hardening.sql
--
-- WHY THIS EXISTS: db/migrate_combined.sql enables Row Level Security
-- and creates tenant-isolation policies on users, landing_pages,
-- tracking_numbers, leads, ad_campaigns, and audit_logs. But Postgres
-- never enforces RLS against a table's owner (or a superuser) -- only
-- against other roles. The app connects with whatever role ran the
-- migrations, i.e. the table owner, so every tenant_isolation_* policy
-- is silently a no-op and cross-tenant queries are not actually
-- blocked. Verified empirically against a local Postgres instance: a
-- query scoped to one tenant via set_config('app.current_tenant_id',
-- ...) -- the exact mechanism lib/db.js's runWithTenant uses -- still
-- returned another tenant's rows when run as the owning role. The
-- identical test as a plain non-owner role isolated correctly, so the
-- policies themselves were never the problem.
--
-- This migration creates a dedicated, non-owner `app_user` role for the
-- app's runtime DATABASE_URL connection, so RLS applies to it with no
-- FORCE needed, and grants it exactly the privileges the app uses.
--
-- CAUGHT DURING REVIEW OF THIS MIGRATION: three Twilio webhook routes
-- (voice, sms-inbound, recording-status) each resolve a tenant_id from
-- tracking_numbers/leads *before* any tenant context exists -- that IS
-- the lookup (e.g. "which tenant owns the number that was just
-- dialed"). Switching the app to a plain non-owner role with strict RLS
-- on those tables would make all three queries silently return zero
-- rows, breaking inbound call routing, SMS opt-out recording, and
-- recording-URL linkage. This migration avoids that by:
--   1. Exempting tracking_numbers from RLS -- it's a public
--      phone-number-to-tenant routing table by design, same trust model
--      already used for prospects/campaign_templates elsewhere in
--      migrate_combined.sql. The app only ever selects the specific
--      columns it needs off a specific dialed number, so this isn't a
--      new exposure, just an explicit one.
--   2. Adding two narrow SECURITY DEFINER functions so the `leads`
--      bootstrap lookups (by call_sid / caller_number) keep working
--      without a blanket RLS carve-out on `leads` itself, which holds
--      real customer call/SMS data and should stay under strict RLS.
--      Both functions pin `search_path` -- an unpinned search_path on a
--      SECURITY DEFINER function is a known local privilege-escalation
--      vector (a caller-controlled schema earlier in the search path
--      could shadow `leads` and have it queried with this function's
--      elevated privileges). EXECUTE is revoked from PUBLIC and granted
--      only to app_user.
--
-- PREREQUISITE: run this AFTER db/migrate_combined.sql (and, if used,
-- db/migrate_prospect_enrichment.sql / db/migrate_prospect_scoring.sql),
-- against the same database.
--
-- PRIVILEGES REQUIRED TO RUN THIS FILE: superuser, or a role with
-- CREATEROLE and ownership of (or GRANT OPTION on) the tables below.
-- This is an admin/operational step, same as any other role-management
-- statement -- a lower-privileged role (e.g. the app's own connection)
-- cannot and should not be able to grant itself access. Run it as the
-- same admin/owner role that ran db/migrate_combined.sql:
--
--   psql "$MIGRATION_DATABASE_URL" -f db/migrate_rls_hardening.sql
--
-- AFTER RUNNING: this migration intentionally does NOT set a password
-- for app_user (leaving one in a committed SQL file is a bad idea).
-- Set it manually, then point the app's DATABASE_URL (not
-- MIGRATION_DATABASE_URL) at app_user:
--
--   psql "$MIGRATION_DATABASE_URL" -c "ALTER ROLE app_user WITH PASSWORD '<generate one>';"
--
-- Idempotent: safe to re-run. Re-running does not touch an existing
-- app_user's password or attributes.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;

-- Tenant-scoped tables the app reads and writes through runWithTenant().
GRANT SELECT, INSERT, UPDATE, DELETE ON
  tenants, users, landing_pages, tracking_numbers, leads, ad_campaigns,
  audit_logs, prospects, prospect_outreach_log, quotes, receipts
  TO app_user;

-- reservations has no tenant_id (it's pre-tenant interest capture) so it
-- isn't in the RLS-scoped list above, but it's still written via the same
-- app_user connection (app/api/reservations/route.js uses plain pool
-- queries, not runWithTenant) and needs its own grant for the same reason.
GRANT SELECT, INSERT ON reservations TO app_user;

-- campaign_templates is shared reference data the app only reads
-- (see app/api/action/launch-campaign/route.js) -- no write grant.
GRANT SELECT ON campaign_templates TO app_user;

-- tracking_numbers must be queryable with no tenant context (see header):
-- app/api/twilio/voice/route.js resolves tenant_id FROM the dialed
-- number, so it can't already know which tenant to scope to.
ALTER TABLE tracking_numbers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tracking_numbers ON tracking_numbers;

-- Force RLS to apply even to the table owner, so tenant isolation
-- doesn't silently disappear again if a connection ever runs as the
-- owner role instead of app_user. Not applied to tracking_numbers
-- (RLS disabled above) or prospects/prospect_outreach_log/
-- campaign_templates (never had RLS -- intentionally public/shared).
--
-- Deliberately NOT applied to `leads` or `users`: their SECURITY DEFINER
-- bootstrap-lookup functions execute with the *definer's* privileges
-- (the migration/owner role), which is exactly how they're able to
-- resolve a row with no tenant context set (leads: which tenant a
-- caller/call_sid belongs to; users: login-by-email, before the tenant
-- is known). FORCE ROW LEVEL SECURITY would bind the owner too, so the
-- functions would run under the same RLS policy as everyone else and
-- return nothing instead of the real row -- caught empirically (see
-- test plan) when an earlier version of this migration forced RLS on
-- leads and its functions silently returned NULL. Both tables still
-- isolate correctly for app_user, which is non-owner and therefore
-- RLS-bound regardless of FORCE.
ALTER TABLE landing_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Bootstrap lookups for the two webhook routes that must resolve a
-- tenant_id from `leads` before any tenant context exists. SQL
-- language (not plpgsql) and STABLE keep the surface minimal; the
-- pinned search_path is the load-bearing part (see header comment).
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
GRANT EXECUTE ON FUNCTION get_tenant_for_call_sid(text) TO app_user;
GRANT EXECUTE ON FUNCTION get_tenant_for_caller_number(text) TO app_user;

-- Bootstrap lookup for login: /api/auth/login must find a user by email
-- before any tenant context exists (that's what it's determining). Same
-- pattern as the two functions above, same pinned search_path reasoning.
-- Returns password_hash too -- it never leaves the server process, only
-- used in-process by lib/session.js's timing-safe comparison.
CREATE OR REPLACE FUNCTION get_user_for_login(p_email text)
RETURNS TABLE(id uuid, tenant_id uuid, role text, password_hash text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT id, tenant_id, role, password_hash FROM users WHERE email = p_email LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_user_for_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_for_login(text) TO app_user;

-- Cross-tenant read for the admin dashboard (app/api/admin/tenants):
-- lead counts per tenant, deliberately just a count, not the underlying
-- rows. This is EXECUTE-granted to app_user like the functions above,
-- but unlike those (which resolve one specific caller/number before a
-- tenant is known), this one is a real, broad cross-tenant view -- the
-- app route is what enforces "only role = 'admin' may call this,"
-- same trust boundary lib/adminAuth.js already uses for the prospecting
-- routes: gated at the app layer, not by a separate DB role.
CREATE OR REPLACE FUNCTION get_lead_counts_by_tenant()
RETURNS TABLE(tenant_id uuid, lead_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id, count(*) FROM leads GROUP BY tenant_id;
$$;

REVOKE ALL ON FUNCTION get_lead_counts_by_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_lead_counts_by_tenant() TO app_user;

COMMIT;
