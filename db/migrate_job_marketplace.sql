-- db/migrate_job_marketplace.sql
-- Cross-tenant job overflow marketplace: a tenant with more work than
-- they can service posts a job; another tenant (a different city, or a
-- crew wanting to expand into a new market) claims it and does the work.
-- The posting tenant earns a commission percentage automatically once
-- the job is marked complete, tracked by a human-readable job tag.
--
-- Deliberately NOT wired to Stripe Connect or any automatic money
-- movement -- this tracks who owes whom what, with the job tag as
-- proof, and tenants settle the commission between themselves outside
-- the platform. That's the simpler, faster-to-build version; automatic
-- payment splitting would require every tenant to onboard a Stripe
-- Connect account (bank details, identity verification) and is a much
-- larger, separate project if ever needed.
--
-- This table is deliberately NOT in the same isolation model as every
-- other tenant-scoped table in this app: an open posting must be
-- visible to every tenant (that's the entire point -- other tenants
-- need to see and claim it), not just the tenant who created it. The
-- RLS policy below reflects that on purpose.

CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Short, human-readable reference so a phone/text conversation between
    -- two tenants can say "job SAC-4821" instead of a UUID. Generated
    -- app-side (city prefix + random digits), enforced unique here.
    job_tag TEXT UNIQUE NOT NULL,

    posting_tenant_id UUID NOT NULL REFERENCES tenants(id),
    claimed_by_tenant_id UUID REFERENCES tenants(id),

    title TEXT NOT NULL,
    description TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,

    -- What the posting tenant expects the job is worth -- shown to
    -- browsing tenants so they can judge whether it's worth claiming
    -- before any commitment. Not what commission is calculated from.
    estimated_value_cents INTEGER,

    -- Percentage of the FINAL price owed back to the posting tenant,
    -- set by the poster at posting time (e.g. 20.00 = 20%). This is the
    -- "what's your percentage" from the original ask -- decided by
    -- whoever is giving up the job, not negotiated per-claim, so a
    -- claiming tenant always knows the deal before claiming.
    commission_percent NUMERIC(5,2) NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 100),

    -- Set by the claiming tenant when marking the job complete -- the
    -- actual price charged, which may differ from the original estimate.
    final_price_cents INTEGER,
    -- Computed once, at completion: final_price_cents * commission_percent / 100.
    -- Stored (not recalculated on read) so it can never silently change
    -- after the fact if commission_percent were ever edited later.
    commission_owed_cents INTEGER,

    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'claimed', 'completed', 'canceled')),

    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_postings_status_open ON job_postings (status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_job_postings_posting_tenant ON job_postings (posting_tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_claimed_tenant ON job_postings (claimed_by_tenant_id);

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;

-- SELECT: any tenant can see OPEN postings (the whole point -- that's
-- the marketplace board), plus either party can always see a posting
-- they're actually involved in regardless of its status.
DROP POLICY IF EXISTS marketplace_visibility_job_postings ON job_postings;
CREATE POLICY marketplace_visibility_job_postings ON job_postings
    FOR SELECT
    USING (
        status = 'open'
        OR posting_tenant_id = current_setting('app.current_tenant_id', true)::UUID
        OR claimed_by_tenant_id = current_setting('app.current_tenant_id', true)::UUID
    );

-- INSERT: a tenant can only ever post a job as themselves.
DROP POLICY IF EXISTS marketplace_insert_job_postings ON job_postings;
CREATE POLICY marketplace_insert_job_postings ON job_postings
    FOR INSERT
    WITH CHECK (posting_tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- UPDATE: same visibility as SELECT (so a tenant can attempt to claim an
-- open job they don't yet have a role on), but the row must belong to
-- them (as poster or claimer) once the update is applied -- this is what
-- makes "claim" work as a single atomic UPDATE ... WHERE status='open',
-- and what makes it impossible for an uninvolved third tenant to modify
-- a posting that already belongs to two other tenants.
DROP POLICY IF EXISTS marketplace_update_job_postings ON job_postings;
CREATE POLICY marketplace_update_job_postings ON job_postings
    FOR UPDATE
    USING (
        status = 'open'
        OR posting_tenant_id = current_setting('app.current_tenant_id', true)::UUID
        OR claimed_by_tenant_id = current_setting('app.current_tenant_id', true)::UUID
    )
    WITH CHECK (
        posting_tenant_id = current_setting('app.current_tenant_id', true)::UUID
        OR claimed_by_tenant_id = current_setting('app.current_tenant_id', true)::UUID
    );

-- No DELETE policy -- postings are canceled (status='canceled'), not
-- removed, so there's always a record of what was posted.
