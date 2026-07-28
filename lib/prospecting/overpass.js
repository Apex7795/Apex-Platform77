// lib/prospecting/overpass.js
// Free, no-API-key alternative to Google Places for local business
// discovery, using OpenStreetMap's Overpass API. No signup, no billing,
// no Google Cloud Console -- the tradeoff is real, not hidden: OSM
// business data is volunteer-maintained, so results are noticeably
// sparser than Google's, especially for small trades businesses that
// never got added to OpenStreetMap, and there's no ratings/review-count
// data at all (OSM has no such concept). Chosen anyway because getting a
// working, funded Google Places key proved to be a real, hours-long
// blocker, and this works immediately with nothing to configure.
//
// Overpass is a shared public resource with a fair-use policy, not a
// paid API with guaranteed capacity. Keep query volume conservative
// (the caller here is already rate-limited to 3 searches/day/tenant) and
// always send a real User-Agent identifying the app, since generic/
// missing User-Agents are more likely to get rate-limited by Overpass.

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'ApexJunkSolutions-Prospecting/1.0';

// OSM has no single generic "business search" the way Google Places
// does -- businesses are tagged under different keys depending on type
// (shop=*, craft=*, office=*). This maps common industry keywords to the
// right OSM tag; anything unrecognized falls back to a free-text name
// search so an arbitrary query string still returns something instead of
// nothing.
const TAG_HINTS = {
  handyman: [['craft', 'handyman']],
  plumber: [['craft', 'plumber']],
  electrician: [['craft', 'electrician']],
  'property management': [['office', 'estate_agent']],
  'property manager': [['office', 'estate_agent']],
  realtor: [['office', 'estate_agent']],
  'real estate': [['office', 'estate_agent']],
  contractor: [['craft', 'builder']],
  builder: [['craft', 'builder']],
  landscaping: [['craft', 'gardener']],
  landscaper: [['craft', 'gardener']],
  mover: [['shop', 'storage_rental']],
  'moving company': [['shop', 'storage_rental']],
};

function escapeForRegex(str) {
  return str.replace(/["\\]/g, '\\$&');
}

function buildQuery({ query, city }) {
  const hints = TAG_HINTS[query.toLowerCase().trim()];
  const cityName = escapeForRegex(city.split(',')[0].trim());
  const filters = hints
    ? hints
        .map(([key, value]) => `node["${key}"="${value}"](area.searchArea);\n  way["${key}"="${value}"](area.searchArea);`)
        .join('\n  ')
    : (() => {
        const term = escapeForRegex(query);
        return `node["name"~"${term}",i](area.searchArea);\n  way["name"~"${term}",i](area.searchArea);`;
      })();

  return `[out:json][timeout:25];
area["name"="${cityName}"]->.searchArea;
(
  ${filters}
);
out center tags 50;`;
}

async function searchBusinesses({ query, city }) {
  const overpassQuery = buildQuery({ query, city });

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `data=${encodeURIComponent(overpassQuery)}`,
  });

  if (!res.ok) {
    // 429/504 here means Overpass's shared public instance is busy, not
    // that anything is misconfigured -- distinguished from a real error
    // by the caller via err.status.
    const error = new Error(`Overpass search failed: ${res.status}`);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const elements = data.elements || [];

  return elements
    .filter((el) => el.tags?.name) // unnamed nodes aren't usable as a lead
    .map((el) => {
      const tags = el.tags || {};
      const streetAddress = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
      return {
        source_place_id: `osm_${el.type}_${el.id}`,
        business_name: tags.name,
        phone: tags.phone || tags['contact:phone'] || null,
        website: tags.website || tags['contact:website'] || null,
        address: streetAddress || null,
        city: tags['addr:city'] || null,
        state: tags['addr:state'] || null,
        // OSM has no rating/review-count/business-status concept --
        // these stay null rather than fabricated, same principle as the
        // rest of this app's "don't invent data you don't have" rule.
        rating: null,
        review_count: null,
        business_status: null,
      };
    });
}

module.exports = { searchBusinesses };
