// app/api/tenant-prospects/discover/route.js
// POST /api/tenant-prospects/discover  { "city": "Sacramento, CA", "query": "property management" }
// Self-service version of jobs/prospectDiscovery.js: a logged-in tenant
// runs their OWN search for their OWN local leads (property managers,
// contractors, homeowners -- whatever industry keyword they type), scoped
// entirely to their tenant_id. This is deliberately a separate table and
// endpoint from the admin-only /api/prospects/discover, which searches
// for junk-removal businesses to prospect as Apex customers -- different
// data, different purpose, different auth model.
//
// Google Places + Hunter.io both cost real money per call and this is a
// tenant-triggered, unauthenticated-by-admin action, so it's rate limited
// per tenant (not just per IP) and enrichment is capped per run.
import { runWithTenant } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';
import { searchBusinesses } from '../../../../lib/prospecting/googlePlaces';
import { enrichContact } from '../../../../lib/prospecting/enrichment';
import { isRateLimited } from '../../../../lib/rateLimit';
import { checkAndConsume } from '../../../../lib/usageCredits';

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3; // per tenant per day
const MAX_ENRICH_PER_RUN = 10; // bound Hunter.io calls per run

export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  if (isRateLimited('tenant_prospect_discover', session.tenantId, { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return Response.json(
      { error: `Limit reached -- up to ${RATE_LIMIT_MAX} searches per day` },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { city, query } = body || {};
  if (!city || !query) {
    return Response.json({ error: 'city and query are both required' }, { status: 400 });
  }
  if (city.length > 200 || query.length > 200) {
    return Response.json({ error: 'city and query must be under 200 characters' }, { status: 400 });
  }

  try {
    // Check the monthly free allowance / purchased credits BEFORE paying
    // for Google Places + Hunter.io -- the per-tenant daily rate limit
    // above is a hard abuse ceiling regardless of plan; this is the
    // actual "have they got usage left" gate.
    const usageResult = await runWithTenant(session.tenantId, (client) =>
      checkAndConsume(client, session.tenantId, 'prospecting_search')
    );
    if (!usageResult.allowed) {
      return Response.json(
        { error: 'Monthly free searches used up -- buy more to keep going this period.', usageExceeded: true, feature: 'prospecting_search' },
        { status: 402 }
      );
    }

    const results = await searchBusinesses({ query, city });

    let enrichedCount = 0;
    const rows = await Promise.all(
      results.map(async (biz, index) => {
        let email = null;
        // Skip enrichment beyond the cap, and for anything with no
        // website (Hunter.io needs a domain to search).
        if (biz.website && index < MAX_ENRICH_PER_RUN) {
          try {
            const enriched = await enrichContact({ website: biz.website });
            if (enriched?.email) {
              email = enriched.email;
              enrichedCount += 1;
            }
          } catch (err) {
            // Missing HUNTER_API_KEY or a provider hiccup shouldn't fail
            // the whole discovery run -- the business listing itself is
            // still useful without an email.
            console.error('Tenant prospect enrichment failed', err.message);
          }
        }
        return { ...biz, email };
      })
    );

    let inserted = 0;
    await runWithTenant(session.tenantId, async (client) => {
      for (const biz of rows) {
        const { rowCount } = await client.query(
          `INSERT INTO tenant_prospects (
             tenant_id, business_name, phone, email, website, address, city, state,
             search_query, source, source_place_id, rating, review_count, business_status,
             status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'google_places', $10, $11, $12, $13, $14)
           ON CONFLICT (tenant_id, source, source_place_id) DO NOTHING`,
          [
            session.tenantId,
            biz.business_name,
            biz.phone,
            biz.email,
            biz.website,
            biz.address,
            biz.city,
            biz.state,
            query,
            biz.source_place_id,
            biz.rating,
            biz.review_count,
            biz.business_status,
            biz.email ? 'enriched' : 'discovered',
          ]
        );
        if (rowCount > 0) inserted += 1;
      }
    });

    return Response.json({ found: results.length, inserted, enriched: enrichedCount });
  } catch (err) {
    console.error('Tenant prospect discovery error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to run prospecting -- please try again' }, { status: 500 });
  }
}
