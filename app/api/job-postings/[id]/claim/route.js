// app/api/job-postings/[id]/claim/route.js
// POST /api/job-postings/:id/claim -- claim an open job posted by
// another tenant. A single conditional UPDATE ... WHERE status='open'
// is what actually prevents two tenants from claiming the same job at
// the same time: whichever request's UPDATE commits first flips the
// status, so the second one matches zero rows and gets a clean
// "already claimed" instead of both succeeding.
import { runWithTenant } from '../../../../../lib/db';
import { getSessionFromRequest } from '../../../../../lib/session';

export async function POST(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { id } = params;

  try {
    const { rows } = await runWithTenant(session.tenantId, (client) =>
      client.query(
        `UPDATE job_postings
         SET status = 'claimed', claimed_by_tenant_id = $2, claimed_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'open' AND posting_tenant_id != $2
         RETURNING *`,
        [id, session.tenantId]
      )
    );

    if (rows.length === 0) {
      // Could be: already claimed by someone else, doesn't exist, or
      // it's the tenant's own posting -- one generic message covers all
      // three without leaking which, since a tenant that can't see the
      // row at all (RLS) would also land here with a 404-shaped result.
      return Response.json(
        { error: 'This job is no longer available to claim -- it may have just been claimed by someone else.' },
        { status: 409 }
      );
    }

    return Response.json({ jobPosting: rows[0] });
  } catch (err) {
    console.error('Job posting claim error:', err.message, { tenantId: session.tenantId, id });
    return Response.json({ error: 'Failed to claim job posting' }, { status: 500 });
  }
}
