// app/api/quotes/route.js
// GET /api/quotes -- list this tenant's past quote estimates, newest first.
// Same pattern as app/api/leads/route.js.
import { runWithTenant } from '../../../lib/db';
import { getSessionFromRequest } from '../../../lib/session';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    const quotes = await runWithTenant(session.tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, lead_id, photo_count, volume_cubic_yards, material_breakdown,
                access_difficulty, time_estimate_hours, cost_labor_cents, cost_disposal_cents,
                cost_travel_cents, suggested_price_cents, created_at
         FROM quotes
         ORDER BY created_at DESC
         LIMIT 50`
      );
      return rows;
    });

    return Response.json({ quotes });
  } catch (err) {
    console.error('Quote list error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}
