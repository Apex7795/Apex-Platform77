// app/api/leads/route.js
// GET /api/leads?page=1
//
// Single-tenant deployment: this app currently serves one business
// (PRIMARY_TENANT_ID), not a multi-tenant signup product, so there's no
// per-user session — every request is scoped to that one tenant.
import { runWithTenant } from '../../../lib/db';

export async function GET(req) {
  const tenantId = process.env.PRIMARY_TENANT_ID;
  if (!tenantId) {
    console.error('PRIMARY_TENANT_ID is not set — refusing all lead requests');
    return Response.json({ error: 'PRIMARY_TENANT_ID not configured' }, { status: 503 });
  }

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
