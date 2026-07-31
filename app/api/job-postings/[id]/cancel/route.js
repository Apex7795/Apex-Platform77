// app/api/job-postings/[id]/cancel/route.js
// POST /api/job-postings/:id/cancel -- the posting tenant pulls their
// own job back off the board. Only allowed while still 'open' --
// once another tenant has claimed it, canceling unilaterally would
// pull work out from under someone who already committed to it, so
// that needs to be a conversation between the two tenants instead of a
// button.
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
         SET status = 'canceled', updated_at = now()
         WHERE id = $1 AND status = 'open' AND posting_tenant_id = $2
         RETURNING *`,
        [id, session.tenantId]
      )
    );

    if (rows.length === 0) {
      return Response.json(
        { error: 'This job cannot be canceled -- it may already be claimed, or is not yours.' },
        { status: 409 }
      );
    }

    return Response.json({ jobPosting: rows[0] });
  } catch (err) {
    console.error('Job posting cancel error:', err.message, { tenantId: session.tenantId, id });
    return Response.json({ error: 'Failed to cancel job posting' }, { status: 500 });
  }
}
