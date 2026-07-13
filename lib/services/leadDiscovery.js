const { pool } = require('../db');
const { searchPlaces } = require('../integrations/googlePlaces');
const { findDomainEmails } = require('../integrations/hunter');

// Mines new prospects for a tenant from Google Places and inserts the ones
// that don't already exist. Existing prospects are matched by name to avoid
// duplicate inserts on repeated discovery runs for the same query.
async function discoverProspects({ tenantId, query, location }) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!query) throw new Error('query is required');

  const places = await searchPlaces({ query, location });
  const created = [];

  for (const place of places) {
    const { rows: existing } = await pool.query(
      `SELECT id FROM prospects WHERE tenant_id = $1 AND name = $2`,
      [tenantId, place.name]
    );
    if (existing.length > 0) continue;

    const { rows } = await pool.query(
      `INSERT INTO prospects (tenant_id, name, rating, review_count, address, place_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name`,
      [tenantId, place.name, place.rating, place.review_count, place.address, place.place_id]
    );
    created.push(rows[0]);
  }

  return { discovered: places.length, created: created.length, prospects: created };
}

async function enrichProspectEmail({ prospectId, domain }) {
  if (!prospectId) throw new Error('prospectId is required');

  const emails = await findDomainEmails({ domain });
  if (emails.length === 0) return null;

  const best = emails.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  await pool.query(`UPDATE prospects SET email = $2, domain = $3 WHERE id = $1`, [
    prospectId,
    best.email,
    domain,
  ]);

  return best;
}

module.exports = { discoverProspects, enrichProspectEmail };
