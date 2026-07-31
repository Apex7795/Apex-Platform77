// services/welcomeProspecting.js
// Fired once, right after a new tenant signs up, so their dashboard isn't
// empty on day one. Deliberately NOT the "scrape Facebook/Craigslist/Reddit
// for people complaining about clutter" idea that got proposed and turned
// down (real ToS/legal exposure -- Craigslist has won lawsuits over exactly
// that, Facebook and Reddit both actively enforce against it, and it turns
// someone's public post into a sales lead they never agreed to be one).
//
// This uses the same free, compliant, already-built tenant prospecting
// pipeline (lib/prospecting/overpass.js) a tenant can run themselves from
// their dashboard -- just triggered automatically once, searching for real
// local referral-source businesses (property managers, real estate agents,
// contractors -- whoever tends to refer this trade's work) instead of
// making them discover that feature on their own. Real business listings,
// not fabricated consumer leads.
//
// Deliberately does NOT go through the tenant-facing rate limiter or
// usage-credit consumption (lib/usageCredits.js) -- this is a welcome
// action the tenant didn't ask for and shouldn't eat into their metered
// monthly allowance before they've done anything themselves.
const { runWithTenant } = require('../lib/db');
const { searchBusinesses } = require('../lib/prospecting/overpass');
const { enrichContact } = require('../lib/prospecting/enrichment');

const MAX_ENRICH = 5; // cap Hunter.io calls -- this runs unattended, unlike a tenant's own deliberate search

// Which kind of business tends to refer this trade work, so the tenant's
// first-ever dashboard view is a real, useful "who could send me jobs"
// list instead of a random one. Falls back to 'property management' --
// property managers and landlords refer out nearly every home-service
// trade, so it's a reasonable default for anything not in this map.
const REFERRAL_QUERY_BY_SERVICE_TYPE = {
  junk_removal: 'property management',
  plumbing: 'property management',
  electrician: 'contractor',
  handyman: 'property management',
  landscaping: 'property management',
  moving: 'real estate',
};

async function runWelcomeProspectSearch({ tenantId, serviceType, serviceArea }) {
  const city = (serviceArea || '').trim();
  if (!city) {
    console.log('Welcome prospecting skipped -- no serviceArea on signup', { tenantId });
    return { skipped: true, reason: 'no_service_area' };
  }

  const query = REFERRAL_QUERY_BY_SERVICE_TYPE[serviceType] || 'property management';

  try {
    const results = await searchBusinesses({ query, city });

    let enrichedCount = 0;
    const rows = await Promise.all(
      results.map(async (biz, index) => {
        let email = null;
        if (biz.website && index < MAX_ENRICH) {
          try {
            const enriched = await enrichContact({ website: biz.website });
            if (enriched?.email) {
              email = enriched.email;
              enrichedCount += 1;
            }
          } catch (err) {
            console.error('Welcome prospecting enrichment failed', err.message);
          }
        }
        return { ...biz, email };
      })
    );

    let inserted = 0;
    await runWithTenant(tenantId, async (client) => {
      for (const biz of rows) {
        const { rowCount } = await client.query(
          `INSERT INTO tenant_prospects (
             tenant_id, business_name, phone, email, website, address, city, state,
             search_query, source, source_place_id, rating, review_count, business_status,
             status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'openstreetmap', $10, $11, $12, $13, $14)
           ON CONFLICT (tenant_id, source, source_place_id) DO NOTHING`,
          [
            tenantId,
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

    console.log(`Welcome prospecting for tenant ${tenantId}: ${results.length} found, ${inserted} inserted, ${enrichedCount} enriched`);
    return { found: results.length, inserted, enriched: enrichedCount };
  } catch (err) {
    // Never let this break signup -- it already returned a response by
    // the time this runs. Overpass being busy (429/504) or Hunter.io
    // being unconfigured are both fine outcomes to just log and move on.
    console.error('Welcome prospecting failed', { tenantId, city, query, error: err.message });
    return { failed: true, error: err.message };
  }
}

module.exports = { runWelcomeProspectSearch };
