// app/api/tenant-prospects/[id]/route.js
// PATCH /api/tenant-prospects/:id  { "status": "contacted" }
// Lets a tenant mark a discovered local lead as contacted/won/lost as
// they work it, same status-tracking idea as leads. RLS scopes the
// UPDATE to rows owned by this tenant regardless of what id is passed.
import { runWithTenant } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';

const ALLOWED_STATUSES = ['discovered', 'enriched', 'contacted', 'won', 'lost'];

export async function PATCH(req, { params }) {
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

  const { status } = body || {};
  if (!ALLOWED_STATUSES.includes(status)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 });
  }

  try {
    const { rowCount } = await runWithTenant(session.tenantId, (client) =>
      client.query(
        `UPDATE tenant_prospects SET status = $1, updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [status, params.id, session.tenantId]
      )
    );

    if (rowCount === 0) {
      return Response.json({ error: 'Prospect not found' }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Update tenant prospect error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to update prospect' }, { status: 500 });
  }
}
