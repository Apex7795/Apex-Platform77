-- db/seed_primary_tenant.sql
-- Seeds the single tenant this deployment serves (see PRIMARY_TENANT_ID
-- in app/api/leads/route.js and friends) plus a handful of sample leads,
-- so the dashboard has something to show before real Twilio calls come
-- in. Run after db/migrate_combined.sql. Idempotent: safe to re-run on
-- every deploy (ON CONFLICT DO NOTHING throughout).

BEGIN;

INSERT INTO tenants (
    id, business_name, service_type, service_area, subdomain,
    owner_email, owner_phone, subscription_status
) VALUES (
    'a17e5f2c-2b41-4e3a-9c8b-6d1f3a9c4e10',
    'Apex Junk Solutions',
    'junk_removal',
    'Local',
    'apex-junk-solutions',
    'owner@apexjunksolutions.example',
    '+15555550100',
    'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO leads (
    tenant_id, source, caller_number, call_duration_seconds, call_sid,
    status, context_notes
) VALUES
    ('a17e5f2c-2b41-4e3a-9c8b-6d1f3a9c4e10', 'seed_demo', '+15555550101', 145, 'SEED_DEMO_1', 'new', 'Garage cleanout, wants a quote this week.'),
    ('a17e5f2c-2b41-4e3a-9c8b-6d1f3a9c4e10', 'seed_demo', '+15555550102', 212, 'SEED_DEMO_2', 'contacted', 'Old furniture pickup, callback scheduled.'),
    ('a17e5f2c-2b41-4e3a-9c8b-6d1f3a9c4e10', 'seed_demo', '+15555550103', 88,  'SEED_DEMO_3', 'quoted', 'Estate cleanout, quote sent for $450.'),
    ('a17e5f2c-2b41-4e3a-9c8b-6d1f3a9c4e10', 'seed_demo', '+15555550104', 301, 'SEED_DEMO_4', 'won', 'Construction debris removal, job booked.'),
    ('a17e5f2c-2b41-4e3a-9c8b-6d1f3a9c4e10', 'seed_demo', '+15555550105', 40,  'SEED_DEMO_5', 'lost', 'Went with a competitor.')
ON CONFLICT (call_sid) DO NOTHING;

COMMIT;
