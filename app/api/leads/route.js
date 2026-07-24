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
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  try {
    const leads = await runWithTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, caller_number, call_duration_seconds, status,
                created_at, recording_url
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
