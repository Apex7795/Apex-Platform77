// app/api/leads/[id]/route.js
// PATCH /api/leads/:id  { "status": "converted" }
//
// Scoped to whichever tenant the logged-in user's session belongs to.
import { runWithTenant } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';

export async function PATCH(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }
  const tenantId = session.tenantId;

  const { id } = params;
  const { status } = await req.json();
  const validStatuses = ['new', 'contacted', 'won', 'lost'];

  if (!validStatuses.includes(status)) {
    return Response.json({ error: 'Invalid status value' }, { status: 400 });
  }

  try {
    const result = await runWithTenant(tenantId, (client) =>
      client.query(
        `UPDATE leads SET status = $1 WHERE id = $2 RETURNING id`,
        [status, id]
      )
    );

    if (result.rowCount === 0) {
      // RLS will silently return 0 rows if this tenant doesn't own the lead
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('Lead status update error:', err.message, { tenantId, leadId: id });
    return Response.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}
