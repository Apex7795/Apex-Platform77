// app/api/leads/[id]/route.js
// PATCH /api/leads/:id  { "status": "converted" }
//
// Single-tenant deployment: see app/api/leads/route.js — scoped to the
// one PRIMARY_TENANT_ID this app serves, not a per-user session.
import { runWithTenant } from '../../../../lib/db';

export async function PATCH(req, { params }) {
  const tenantId = process.env.PRIMARY_TENANT_ID;
  if (!tenantId) {
    console.error('PRIMARY_TENANT_ID is not set — refusing all lead requests');
    return Response.json({ error: 'PRIMARY_TENANT_ID not configured' }, { status: 503 });
  }

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
