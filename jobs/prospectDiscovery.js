// jobs/prospectDiscovery.js
// Run on a schedule (e.g. daily) or trigger manually per-city via the API.
// Discovers new businesses via OpenStreetMap's free Overpass API, de-dupes
// against existing prospects, scores fit, then attempts enrichment on
// anything new. Was Google Places originally; switched to match the
// tenant-facing prospecting route (see lib/prospecting/overpass.js) --
// getting a funded Google Places key was a real, hours-long blocker, and
// this one never got migrated when that switch happened.
const { pool } = require('../lib/db');
const { searchBusinesses } = require('../lib/prospecting/overpass');
const { enrichContact } = require('../lib/prospecting/enrichment');
const { scoreProspect } = require('../services/prospectScoring');

const DEFAULT_QUERY = 'junk removal';

// Semicolon-separated "City, ST" entries, same convention (and same env
// var) as services/prospectScoring.js's TARGET_SERVICE_AREAS -- one list
// of cities drives both "where do we search" and "does this prospect's
// city count as a fit" instead of the two being configured separately
// and drifting apart. Semicolons between entries, not commas: a comma
// already separates city from state within each entry (see
// prospectScoring.js's getTargetServiceAreas for the bug this avoids).
// Empty/unset falls back to the single hardcoded default below, same as
// before this was configurable at all.
function getTargetCities() {
  const raw = process.env.TARGET_SERVICE_AREAS;
  if (!raw) return ['Sacramento, CA'];
  return raw.split(';').map((s) => s.trim()).filter(Boolean);
}

function getTargetQueries() {
  const raw = process.env.TARGET_PROSPECT_QUERIES;
  if (!raw) return [DEFAULT_QUERY];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// --- Discover + upsert prospects for a single city ---
async function discoverCity({ city, query = DEFAULT_QUERY }) {
  const results = await searchBusinesses({ query, city });
  let inserted = 0;

  for (const biz of results) {
    const { score, tier, reasons } = scoreProspect(biz);

    const { rows } = await pool.query(
      `INSERT INTO prospects
         (business_name, phone, website, address, city, state, source, source_place_id,
          rating, review_count, business_status, fit_score, fit_tier, fit_reasons)
       VALUES ($1, $2, $3, $4, $5, $6, 'openstreetmap', $7, $8, $9, $10, $11, $12, $13::jsonb)
       ON CONFLICT (source, source_place_id) DO NOTHING
       RETURNING id`,
      [
        biz.business_name,
        biz.phone,
        biz.website,
        biz.address,
        biz.city,
        biz.state,
        biz.source_place_id,
        biz.rating,
        biz.review_count,
        biz.business_status,
        score,
        tier,
        JSON.stringify(reasons),
      ]
    );
    if (rows.length > 0) inserted += 1;
  }

  console.log(`Discovery for "${city}": ${results.length} found, ${inserted} new`);
  return { found: results.length, inserted };
}

// --- Enrich any prospect that has a website but no email yet ---
// Deliberately skips 'disqualified' prospects (permanently closed per
// Google) — no point spending Hunter.io calls enriching a dead business.
async function enrichPendingProspects({ limit = 50 } = {}) {
  const { rows: pending } = await pool.query(
    `SELECT id, website FROM prospects
     WHERE status = 'discovered' AND website IS NOT NULL AND email IS NULL
       AND (fit_tier IS NULL OR fit_tier != 'disqualified')
     LIMIT $1`,
    [limit]
  );

  let enriched = 0;
  for (const prospect of pending) {
    try {
      const result = await enrichContact({ website: prospect.website });
      if (result?.email) {
        await pool.query(
          `UPDATE prospects SET email = $1, status = 'enriched', updated_at = now() WHERE id = $2`,
          [result.email, prospect.id]
        );
        enriched += 1;
      }
    } catch (err) {
      // One bad enrichment call shouldn't stop the batch
      console.error('Enrichment failed for prospect', prospect.id, err.message);
    }
  }

  console.log(`Enrichment: ${enriched}/${pending.length} prospects enriched`);
  return { attempted: pending.length, enriched };
}

// --- Full run across every (query x city) combination ---
// Defaults to TARGET_SERVICE_AREAS / TARGET_PROSPECT_QUERIES from env so
// this actually covers every city and business type you've configured,
// instead of the single hardcoded city + "junk removal" this used to be
// stuck on. Pass explicit cities/queries to override for a one-off run
// (e.g. from the admin dashboard triggering a specific search).
async function runProspectDiscoveryJob({ cities, queries } = {}) {
  const targetCities = cities || getTargetCities();
  const targetQueries = queries || getTargetQueries();

  for (const query of targetQueries) {
    for (const city of targetCities) {
      try {
        await discoverCity({ city, query });
      } catch (err) {
        console.error('Discovery failed', { city, query, error: err.message });
      }
    }
  }
  await enrichPendingProspects();
}

module.exports = { discoverCity, enrichPendingProspects, runProspectDiscoveryJob };

// --- Scheduling ---
// Actual scheduling lives in scripts/cron.js, not here — see that file.
