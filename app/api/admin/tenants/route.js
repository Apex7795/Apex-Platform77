// app/api/admin/tenants/route.js
// GET /api/admin/tenants -- lists every tenant on the platform, for the
// platform owner's admin dashboard. Requires role = 'admin' on the
// session; a regular tenant 'owner' gets 403, same as anyone logged out
// gets 401. This is the actual admin/owner-of-the-platform view that
// distinguishes "the person running this platform" from "a tenant using
// it" -- see lib/adminAuth.js for the separate, older, API-only gate
// used by the prospecting routes (unrelated: that's for Apex staff
// scripts, this is for a real logged-in admin user in the browser).
import { pool } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    // tenants has no RLS (root entity, nothing to scope it by), so this
    // is a plain read. Lead counts go through get_lead_counts_by_tenant()
    // since leads IS under RLS and this route intentionally needs to see
    // across all tenants.
    const [tenantsResult, countsResult] = await Promise.all([
      pool.query(
        `SELECT id, business_name, service_type, service_area, subdomain,
                owner_email, owner_phone, subscription_status, created_at
         FROM tenants
         ORDER BY created_at DESC`
      ),
      pool.query('SELECT * FROM get_lead_counts_by_tenant()'),
    ]);

    const countsByTenant = Object.fromEntries(
      countsResult.rows.map((row) => [row.tenant_id, Number(row.lead_count)])
    );

    const tenants = tenantsResult.rows.map((tenant) => ({
      ...tenant,
      leadCount: countsByTenant[tenant.id] || 0,
    }));

    return Response.json({ tenants });
  } catch (err) {
    console.error('Admin tenants fetch error:', err.message);
    return Response.json({ error: 'Failed to fetch tenants' }, { status: 500 });
  }
}
