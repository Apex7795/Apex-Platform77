// app/api/tenant-prospects/route.js
// GET /api/tenant-prospects -- list the logged-in tenant's own discovered
// local leads, most recent first. RLS on tenant_prospects means this can
// never return another tenant's rows even if something upstream got the
// tenantId wrong.
import { runWithTenant } from '../../../lib/db';
import { getSessionFromRequest } from '../../../lib/session';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    const prospects = await runWithTenant(session.tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, business_name, phone, email, website, address, city, state,
                rating, review_count, status, created_at
         FROM tenant_prospects
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [session.tenantId]
      );
      return rows;
    });

    return Response.json({ prospects });
  } catch (err) {
    console.error('List tenant prospects error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to load prospects' }, { status: 500 });
  }
}
