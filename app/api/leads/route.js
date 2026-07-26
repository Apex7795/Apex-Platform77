// app/api/leads/route.js
// GET /api/leads?page=1
//
// Scoped to whichever tenant the logged-in user's session belongs to.
import { runWithTenant } from '../../../lib/db';
import { getSessionFromRequest } from '../../../lib/session';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }
  const tenantId = session.tenantId;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page'), 10) || 1;
  // Bumped from a hard 25 so search/filter/Kanban on the dashboard have a
  // realistic amount of data to work with, capped so a caller can't ask
  // for an unbounded result set.
  const pageSize = Math.min(parseInt(searchParams.get('limit'), 10) || 100, 200);
  const offset = (page - 1) * pageSize;

  try {
    const leads = await runWithTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, caller_number, call_duration_seconds, status,
                created_at, recording_url, source, phone_verified, phone_line_type, tags,
                -- Evaluated over every one of this tenant's leads (RLS-scoped),
                -- not just the current page, so this is a real duplicate
                -- signal even if the dupe landed on a different page.
                COUNT(*) OVER (PARTITION BY caller_number) > 1 AS is_duplicate
         FROM leads
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      );
      return rows;
    });

    return Response.json({ leads, page, pageSize });
  } catch (err) {
    console.error('Lead fetch error:', err.message, { tenantId });
    return Response.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}
