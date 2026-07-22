// app/api/leads/active-call/route.js
// GET /api/leads/active-call?phone=+15551234567
// Looks up prior call history for a caller, for a "who's calling" popup while
// the phone is ringing. Matches on leads.caller_number, tenant-scoped.
//
// Single-tenant deployment: see app/api/leads/route.js — scoped to the
// one PRIMARY_TENANT_ID this app serves, not a per-user session.
import { runWithTenant } from '../../../../lib/db';

export async function GET(req) {
  const tenantId = process.env.PRIMARY_TENANT_ID;
  if (!tenantId) {
    console.error('PRIMARY_TENANT_ID is not set — refusing all lead requests');
    return Response.json({ error: 'PRIMARY_TENANT_ID not configured' }, { status: 503 });
  }

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
