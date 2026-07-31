// app/api/job-postings/[id]/complete/route.js
// POST /api/job-postings/:id/complete { final_price_cents } -- the
// claiming tenant marks the job done and records what it actually
// charged. Commission owed to the posting tenant is calculated once,
// here, from the real final price -- not the original estimate -- and
// stored permanently so it can't drift even if commission_percent were
// ever changed on the row later.
import { runWithTenant } from '../../../../../lib/db';
import { getSessionFromRequest } from '../../../../../lib/session';

export async function POST(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { id } = params;

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const finalPriceCents = Number(body?.final_price_cents);
  if (!Number.isFinite(finalPriceCents) || finalPriceCents < 0) {
    return Response.json({ error: 'final_price_cents must be a non-negative number' }, { status: 400 });
  }

  try {
    const { rows } = await runWithTenant(session.tenantId, (client) =>
      client.query(
        `UPDATE job_postings
         SET status = 'completed',
             final_price_cents = $2,
             commission_owed_cents = ROUND($2 * commission_percent / 100),
             completed_at = now(),
             updated_at = now()
         WHERE id = $1 AND status = 'claimed' AND claimed_by_tenant_id = $3
         RETURNING *`,
        [id, finalPriceCents, session.tenantId]
      )
    );

    if (rows.length === 0) {
      return Response.json(
        { error: 'This job cannot be marked complete -- it may not be claimed by you, or is already completed.' },
        { status: 409 }
      );
    }

    return Response.json({ jobPosting: rows[0] });
  } catch (err) {
    console.error('Job posting complete error:', err.message, { tenantId: session.tenantId, id });
    return Response.json({ error: 'Failed to mark job posting complete' }, { status: 500 });
  }
}
