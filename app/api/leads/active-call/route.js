// app/api/leads/active-call/route.js
// GET /api/leads/active-call?phone=+15551234567
// Looks up prior call history for a caller, for a "who's calling" popup while
// the phone is ringing. Matches on leads.caller_number, tenant-scoped.
//
// Scoped to whichever tenant the logged-in user's session belongs to.
import { runWithTenant } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }
  const tenantId = session.tenantId;

  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone');
  if (!phone) {
    return Response.json({ error: 'phone query parameter is required' }, { status: 400 });
  }

  try {
    const leads = await runWithTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, caller_number, call_duration_seconds, status,
                context_notes, last_touched_at, created_at
         FROM leads
         WHERE caller_number = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [phone]
      );
      return rows;
    });

    if (leads.length === 0) {
      return Response.json({ isNewCaller: true, leads: [] });
    }

    return Response.json({ isNewCaller: false, leads });
  } catch (err) {
    console.error('Active call lookup error:', err.message, { tenantId, phone });
    return Response.json({ error: 'Failed to look up caller' }, { status: 500 });
  }
}
