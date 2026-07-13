-- db/migrate_rls_hardening.sql
--
-- WHY THIS EXISTS: db/migrate_combined.sql enables Row Level Security
-- and creates tenant-isolation policies on users, landing_pages,
-- tracking_numbers, leads, ad_campaigns, and audit_logs. But Postgres
-- RLS is NEVER enforced against a table's owner (or a superuser) --
-- only against other roles, and only once FORCE ROW LEVEL SECURITY is
-- set. Today the app connects with whatever role ran the migrations,
-- i.e. the table owner, so every tenant_isolation_* policy is silently
-- a no-op and cross-tenant queries are not actually blocked.
--
-- This migration creates a dedicated, non-owner `app_user` role for the
-- app's runtime DATABASE_URL connection, grants it exactly the
-- privileges the app needs, and forces RLS so it applies even if a
-- future connection ends up using the owner role again.
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
--   psql "$DATABASE_URL" -f db/migrate_rls_hardening.sql
--
-- AFTER RUNNING: this migration intentionally does NOT set a password
-- for app_user (leaving one in a committed SQL file is a bad idea).
-- Set it manually, then point the app's DATABASE_URL at app_user:
--
--   psql "$DATABASE_URL" -c "ALTER ROLE app_user WITH PASSWORD '<generate one>';"
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
  audit_logs, prospects, prospect_outreach_log
  TO app_user;

-- campaign_templates is shared reference data the app only reads
-- (see app/api/action/launch-campaign/route.js) -- no write grant.
GRANT SELECT ON campaign_templates TO app_user;

-- Force RLS to apply even to the table owner, so tenant isolation
-- doesn't silently disappear again if a connection ever runs as the
-- owner role instead of app_user.
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE landing_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE tracking_numbers FORCE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

COMMIT;
