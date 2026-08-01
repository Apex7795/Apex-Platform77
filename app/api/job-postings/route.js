// app/api/job-postings/route.js
// GET  /api/job-postings -- every posting the logged-in tenant can see:
//   every OPEN posting (the shared marketplace board), plus anything
//   they posted or claimed themselves regardless of status. RLS on
//   job_postings enforces this exact visibility at the database level
//   (see db/migrate_job_marketplace.sql) -- this route does not need to
//   filter anything itself, a plain SELECT already returns only what
//   the tenant is allowed to see.
// POST /api/job-postings { title, description, city, state,
//   estimated_value_cents, commission_percent } -- post a job you can't
//   reach for another tenant to claim.
import { runWithTenant } from '../../../lib/db';
import { getSessionFromRequest } from '../../../lib/session';
import { generateJobTag } from '../../../lib/jobPostingTag';
import { alertTenantsOfNewJobPosting } from '../../../services/jobPostingAlerts';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    const rows = await runWithTenant(session.tenantId, (client) =>
      client.query(
        `SELECT jp.*, pt.business_name AS posting_business_name,
                ct.business_name AS claimed_business_name
         FROM job_postings jp
         JOIN tenants pt ON pt.id = jp.posting_tenant_id
         LEFT JOIN tenants ct ON ct.id = jp.claimed_by_tenant_id
         ORDER BY jp.created_at DESC`
      )
    );
    return Response.json({ jobPostings: rows.rows, myTenantId: session.tenantId });
  } catch (err) {
    console.error('Job postings fetch error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to load job postings' }, { status: 500 });
  }
}

export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, description, city, state, estimated_value_cents, commission_percent } = body || {};
  if (!title || !city || !state || commission_percent == null) {
    return Response.json(
      { error: 'title, city, state, and commission_percent are required' },
      { status: 400 }
    );
  }
  const commissionNum = Number(commission_percent);
  if (!Number.isFinite(commissionNum) || commissionNum < 0 || commissionNum > 100) {
    return Response.json({ error: 'commission_percent must be between 0 and 100' }, { status: 400 });
  }

  try {
    // Job tags aren't globally sequential, just random-per-city, so a
    // collision is possible (if unlikely) -- retry on the unique
    // constraint rather than fail the whole post over it.
    let lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      const jobTag = generateJobTag(city);
      try {
        const { rows } = await runWithTenant(session.tenantId, (client) =>
          client.query(
            `INSERT INTO job_postings
               (job_tag, posting_tenant_id, title, description, city, state,
                estimated_value_cents, commission_percent, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
             RETURNING *`,
            [
              jobTag,
              session.tenantId,
              title,
              description || null,
              city,
              state,
              estimated_value_cents || null,
              commissionNum,
            ]
          )
        );
        // Fire-and-forget: SMS latency (or Twilio being down) should never
        // delay or fail the post itself.
        alertTenantsOfNewJobPosting(rows[0], session.tenantId).catch((err) =>
          console.error('alertTenantsOfNewJobPosting failed to even start', err.message)
        );

        return Response.json({ jobPosting: rows[0] }, { status: 201 });
      } catch (err) {
        if (err.code === '23505') {
          // unique_violation on job_tag -- try again with a new tag
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  } catch (err) {
    console.error('Job posting create error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to create job posting' }, { status: 500 });
  }
}
