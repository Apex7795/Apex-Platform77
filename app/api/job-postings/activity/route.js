// app/api/job-postings/activity/route.js
// GET /api/job-postings/activity -- real recent completed marketplace
// activity, for any logged-in tenant to see (not just the two parties
// involved in a given job). Backed by get_recent_completed_marketplace_jobs(),
// a SECURITY DEFINER function that deliberately exposes only title, city,
// state, completed_at, and the claiming business's name -- never commission
// amounts, never any customer/consumer data (there isn't any on this table).
// See db/migrate_marketplace_activity.sql for the full reasoning.
//
// Real data only: if nothing has completed yet, this returns an empty
// array, and the UI says so honestly rather than showing anything made up.
import { query } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    const { rows } = await query('SELECT * FROM get_recent_completed_marketplace_jobs($1)', [5]);
    return Response.json({ recentJobs: rows });
  } catch (err) {
    console.error('Marketplace activity fetch error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to load recent activity' }, { status: 500 });
  }
}
