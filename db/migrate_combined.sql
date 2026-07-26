-- scripts/migrate_combined.js content, as raw SQL for review.
-- Combines db/schema.sql (existing platform) with the Prospecting module's
-- migrate_prospects.js, as ONE atomic migration so prospects/outreach_log
-- never exist without the tenants table they FK against, and vice versa.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS throughout).

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- EXISTING PLATFORM SCHEMA (unchanged from db/schema.sql)
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT NOT NULL,
    service_type TEXT NOT NULL,
    service_area TEXT NOT NULL,
    subdomain TEXT UNIQUE NOT NULL,
    owner_email TEXT NOT NULL,
    owner_phone TEXT NOT NULL,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'trialing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "salt:hash" hex, from Node's built-in crypto.scrypt (lib/session.js) --
-- ALTER not merged into the CREATE above since that only runs on a brand
-- new table; production's `users` table already exists.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE IF NOT EXISTS landing_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    headline TEXT NOT NULL,
    content_json JSONB NOT NULL,
    theme TEXT NOT NULL DEFAULT 'default',
    is_published BOOLEAN NOT NULL DEFAULT false,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracking_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    twilio_sid TEXT UNIQUE NOT NULL,
    phone_number TEXT UNIQUE NOT NULL,
    forwards_to TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    caller_number TEXT,
    call_duration_seconds INT,
    call_sid TEXT UNIQUE,
    recording_url TEXT,
    form_data JSONB,
    status TEXT NOT NULL DEFAULT 'new',
    last_touched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rescue_stage INT NOT NULL DEFAULT 0,
    sms_opt_out BOOLEAN NOT NULL DEFAULT false,
    context_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Twilio Lookup-based phone verification, added on top of the existing
-- table (ALTER not merged into the CREATE above -- production's `leads`
-- table already exists, same reasoning as password_hash on users).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN;
-- NULL = not checked (e.g. call leads, or lookup failed/skipped),
-- true/false = Twilio Lookup gave a definitive answer.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_line_type TEXT;
-- mobile | landline | voip | fixedVoip | nonFixedVoip | personal | tollFree | premium | other
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_verification_checked_at TIMESTAMPTZ;

-- AI photo-based job quote estimates. Tenant-scoped like leads --
-- lead_id is optional (a quote can be run standalone, before a lead
-- even exists yet, e.g. estimating a job over the phone while looking
-- at photos texted in).
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    photo_count INT NOT NULL DEFAULT 0,
    volume_cubic_yards NUMERIC(6,1),
    material_breakdown JSONB, -- {"furniture": 40, "boxes": 60, ...} percentages
    access_difficulty TEXT, -- easy | medium | hard | very_hard
    time_estimate_hours NUMERIC(5,1),
    cost_labor_cents INT,
    cost_disposal_cents INT,
    cost_travel_cents INT,
    suggested_price_cents INT,
    raw_analysis JSONB, -- full AI response, kept for reference/debugging
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant ON quotes(tenant_id, created_at DESC);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_quotes ON quotes;
CREATE POLICY tenant_isolation_quotes ON quotes
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
-- Grant itself lives in db/migrate_rls_hardening.sql's centralized list,
-- alongside every other app_user table grant -- not here, so there's one
-- place to check for "does app_user actually have access to this table."

-- Completed-job record: what a customer actually got charged, once a job
-- is done. Separate from `quotes` (the pre-job estimate) since the final
-- price can differ from the estimate, and a receipt can exist for a job
-- that never went through the photo estimator at all -- quote_id/lead_id
-- are both optional links, not requirements.
CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    customer_name TEXT,
    final_price_cents INT NOT NULL,
    notes TEXT,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON receipts(tenant_id, completed_at DESC);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_receipts ON receipts;
CREATE POLICY tenant_isolation_receipts ON receipts
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Self-service local lead prospecting, per tenant. Separate from the
-- admin-only `prospects` table below (that one is Apex's own sales
-- funnel, scored on "fit as an Apex customer") -- this is a tenant
-- finding their OWN customers (property managers, contractors, etc. in
-- their own service area) via the same Google Places search, so it needs
-- its own tenant-scoped, RLS-protected table rather than reusing prospects'
-- schema/semantics.
CREATE TABLE IF NOT EXISTS tenant_prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    website TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    search_query TEXT,
    source TEXT NOT NULL DEFAULT 'google_places',
    source_place_id TEXT,
    rating NUMERIC(2,1),
    review_count INT,
    business_status TEXT,
    status TEXT NOT NULL DEFAULT 'discovered'
        CHECK (status IN ('discovered', 'enriched', 'contacted', 'won', 'lost')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Per-tenant uniqueness, not global: two different tenants prospecting
    -- overlapping territory can both legitimately discover the same
    -- business independently.
    UNIQUE (tenant_id, source, source_place_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_prospects_tenant ON tenant_prospects(tenant_id, created_at DESC);

ALTER TABLE tenant_prospects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenant_prospects ON tenant_prospects;
CREATE POLICY tenant_isolation_tenant_prospects ON tenant_prospects
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);
-- Grant itself lives in db/migrate_rls_hardening.sql's centralized list.

CREATE TABLE IF NOT EXISTS ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    category TEXT,
    external_campaign_id TEXT,
    daily_budget_cents INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    headline TEXT NOT NULL,
    body TEXT NOT NULL,
    keywords TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Low-friction "reserve a spot" capture (e.g. Facebook group promo) --
-- deliberately separate from `tenants`/`users`: this is just an interest
-- list (name/email/business, no password) for people not ready to
-- complete full signup yet. No RLS -- nothing here is tenant-scoped, it
-- doesn't exist as a tenant yet.
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    business_name TEXT,
    source TEXT, -- e.g. 'facebook_group'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON reservations(created_at);

-- Was present in db/schema.sql and scripts/migrate.js but missing from
-- this combined migration, so a fresh deploy that only runs this file
-- never got the table -- app/api/action/launch-campaign/route.js's
-- INSERT INTO audit_logs would fail on first use.
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    resource_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_tenant ON landing_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tracking_numbers_tenant ON tracking_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_rescue ON leads(status, rescue_stage, last_touched_at)
    WHERE status IN ('new', 'no_answer');
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_tenant ON ad_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

DROP POLICY IF EXISTS tenant_isolation_landing_pages ON landing_pages;
CREATE POLICY tenant_isolation_landing_pages ON landing_pages
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

DROP POLICY IF EXISTS tenant_isolation_tracking_numbers ON tracking_numbers;
CREATE POLICY tenant_isolation_tracking_numbers ON tracking_numbers
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

DROP POLICY IF EXISTS tenant_isolation_leads ON leads;
CREATE POLICY tenant_isolation_leads ON leads
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

DROP POLICY IF EXISTS tenant_isolation_ad_campaigns ON ad_campaigns;
CREATE POLICY tenant_isolation_ad_campaigns ON ad_campaigns
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;
CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- NOTE: changed from the original schema.sql, which called
-- current_setting('app.current_tenant_id') WITHOUT the `true` (missing_ok)
-- second argument. Without it, Postgres THROWS on any query run without
-- the session var set, instead of just returning zero rows. That's what
-- breaks the prospect-reply route below if it ever bypasses runWithTenant
-- again — adding `true` here makes "no tenant context" fail closed (0 rows)
-- rather than fail with a hard error, matching the behavior your audit_logs
-- RLS test script already expects.

-- ============================================================
-- PROSPECTING MODULE (new)
-- ============================================================

CREATE TABLE IF NOT EXISTS prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    website TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    service_type TEXT NOT NULL DEFAULT 'junk_removal',
    source TEXT NOT NULL,
    source_place_id TEXT,
    status TEXT NOT NULL DEFAULT 'discovered'
        CHECK (status IN ('discovered', 'enriched', 'contacted', 'replied', 'converted', 'opted_out')),
    opted_out BOOLEAN NOT NULL DEFAULT false,
    opted_out_at TIMESTAMPTZ,
    last_contacted_at TIMESTAMPTZ,
    contact_attempts INT NOT NULL DEFAULT 0,
    converted_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, source_place_id)
);

CREATE TABLE IF NOT EXISTS prospect_outreach_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    channel TEXT NOT NULL DEFAULT 'email',
    subject TEXT,
    body TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_city ON prospects(city, state);
CREATE INDEX IF NOT EXISTS idx_prospects_opted_out ON prospects(opted_out) WHERE opted_out = true;
CREATE INDEX IF NOT EXISTS idx_outreach_log_prospect ON prospect_outreach_log(prospect_id);

-- prospects / prospect_outreach_log intentionally have NO RLS, matching
-- campaign_templates: this is Apex's own acquisition data, not owned by
-- any tenant. Access control for these tables must happen at the route/
-- middleware layer instead (see the auth gap flagged separately).

COMMIT;
