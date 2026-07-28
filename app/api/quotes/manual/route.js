// app/api/quotes/manual/route.js
// POST /api/quotes/manual -- a no-AI fallback quote path. The operator
// picks an approximate load size and access difficulty themselves
// instead of uploading photos for AI analysis, and gets the exact same
// transparent cost math (lib/quoteAnalysis.js's calculatePricing) as the
// AI path. Zero dependency on OPENAI_API_KEY/billing -- this always
// works, so the feature isn't dead in the water while that gets sorted
// out. Uses the same `quotes` table, just tagged with
// raw_analysis.source = 'manual' so it's distinguishable from a real AI
// analysis in the data.
import { runWithTenant } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';
import { calculatePricing } from '../../../../lib/quoteAnalysis';

// Rough cubic-yard/hour midpoints per load size -- not AI-derived, just
// reasonable defaults an operator can eyeball against a truck bed, in the
// same 0.5-40 yd3 / 0.5-8 hr ranges the AI path uses.
const LOAD_SIZES = {
  quarter: { volumeCubicYards: 3, timeEstimateHours: 1 },
  half: { volumeCubicYards: 6, timeEstimateHours: 2 },
  three_quarter: { volumeCubicYards: 10, timeEstimateHours: 3 },
  full: { volumeCubicYards: 13, timeEstimateHours: 4 },
};
const ACCESS_DIFFICULTIES = ['easy', 'medium', 'hard', 'very_hard'];

export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { loadSize, accessDifficulty, travelMiles, leadId } = body || {};
  if (!LOAD_SIZES[loadSize]) {
    return Response.json({ error: 'loadSize must be one of: quarter, half, three_quarter, full' }, { status: 400 });
  }
  if (!ACCESS_DIFFICULTIES.includes(accessDifficulty)) {
    return Response.json({ error: 'accessDifficulty must be one of: easy, medium, hard, very_hard' }, { status: 400 });
  }
  const miles = Number(travelMiles) || 0;

  try {
    const analysis = {
      volume_cubic_yards: LOAD_SIZES[loadSize].volumeCubicYards,
      time_estimate_hours: LOAD_SIZES[loadSize].timeEstimateHours,
      access_difficulty: accessDifficulty,
      material_breakdown: null,
      notes: 'Manually estimated -- no photos analyzed.',
    };
    const pricing = calculatePricing(analysis, { travelMiles: miles });

    const { rows } = await runWithTenant(session.tenantId, (client) =>
      client.query(
        `INSERT INTO quotes (
           tenant_id, lead_id, photo_count, volume_cubic_yards, material_breakdown,
           access_difficulty, time_estimate_hours, cost_labor_cents, cost_disposal_cents,
           cost_travel_cents, suggested_price_cents, raw_analysis
         ) VALUES ($1, $2, 0, $3, NULL, $4, $5, $6, $7, $8, $9, $10::jsonb)
         RETURNING id, created_at`,
        [
          session.tenantId,
          leadId || null,
          analysis.volume_cubic_yards,
          analysis.access_difficulty,
          analysis.time_estimate_hours,
          pricing.costLaborCents,
          pricing.costDisposalCents,
          pricing.costTravelCents,
          pricing.suggestedPriceCents,
          JSON.stringify({ ...analysis, source: 'manual' }),
        ]
      )
    );

    return Response.json({
      id: rows[0].id,
      createdAt: rows[0].created_at,
      analysis,
      pricing,
    });
  } catch (err) {
    console.error('Manual quote error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to save quote' }, { status: 500 });
  }
}
