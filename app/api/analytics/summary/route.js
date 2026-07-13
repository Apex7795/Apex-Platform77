import { pool } from '@/lib/db';
import { isAuthorized } from '@/lib/auth';

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = process.env.PROSPECTING_HOUSE_TENANT_ID;

  const [leadsResult, prospectsResult, jobsResult] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS count FROM leads WHERE tenant_id = $1 GROUP BY status`,
      [tenantId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total, COALESCE(AVG(conversion_probability), 0)::float AS avg_probability
       FROM prospects WHERE tenant_id = $1`,
      [tenantId]
    ),
    pool.query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(commission_amount), 0)::float AS commission
       FROM booked_jobs WHERE tenant_id = $1 GROUP BY status`,
      [tenantId]
    ),
  ]);

  return Response.json({
    leads_by_status: leadsResult.rows,
    prospects: prospectsResult.rows[0],
    booked_jobs_by_status: jobsResult.rows,
  });
}
