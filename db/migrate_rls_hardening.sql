-- Hardens the tenant-isolation RLS policies added in migrate_combined.sql
-- (and schema.sql before it) so they actually apply.
--
-- Background: RLS policies were correct all along, but Postgres exempts a
-- table's OWNER from its own RLS policies unless FORCE ROW LEVEL SECURITY
-- is set. This repo only ever had one DATABASE_URL (see .env.example,
-- which already named it app_user — that role was just never created),
-- so the app has been connecting as the table-owning/migration role,
-- meaning RLS on users/landing_pages/tracking_numbers/leads/ad_campaigns
-- has provided zero actual tenant isolation. Verified empirically: a
-- query scoped to one tenant via set_config('app.current_tenant_id', ...)
-- — the exact mechanism lib/db.js's runWithTenant uses — still returned
-- another tenant's rows when run as the owning role. Re-running the
-- identical test as a plain granted (non-owner) role isolated correctly,
-- confirming the policies themselves were never the problem.
--
-- This migration:
--   1. Creates app_user as a non-owner role, so RLS applies to it by
--      default with no FORCE needed.
--   2. Exempts tracking_numbers from RLS — it's a public phone-number to
--      tenant routing table by design (see comment below), same pattern
--      already used for prospects/campaign_templates elsewhere in
--      migrate_combined.sql.
--   3. Adds two narrow SECURITY DEFINER functions so the two `leads`
--      bootstrap lookups (resolving a tenant_id from a call_sid or
--      caller_number, before any tenant context exists) keep working
--      without a blanket carve-out on `leads` itself, which holds real
--      customer call/SMS data and should stay under strict RLS.
--
-- Run this AFTER migrate_combined.sql, as the table-owning/admin role
-- (the same role used for all other migrations) — app_user itself does
-- not have privileges to run this migration.
--
-- IMPORTANT — operational step this migration does NOT do: after running
-- this, the deployed app's DATABASE_URL must be switched from the owner
-- connection to an app_user connection for RLS to actually take effect.
-- This migration only sets up the role and grants; it has no way to know
-- or change your platform's live connection secret. Also set app_user's
-- password out-of-band (e.g. `ALTER ROLE app_user WITH PASSWORD '...'`
-- from a secrets manager) — do not commit a real password into this file.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- tracking_numbers maps a Twilio phone number to a tenant_id/forwards_to
-- pair, and by construction must be queryable with no tenant context —
-- resolving the tenant from the dialed number IS the lookup
-- (app/api/twilio/voice/route.js). Not a security compromise as long as
-- callers only select the two columns they need, which that route
-- already does.
ALTER TABLE tracking_numbers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tracking_numbers ON tracking_numbers;

-- SET search_path is not optional here: an unpinned search_path on a
-- SECURITY DEFINER function is a known local privilege-escalation vector
-- (a caller could shadow a table/function earlier in their own search
-- path and have it execute with this function's elevated privileges).
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

COMMIT;
