// app/api/leads/[id]/route.js
// PATCH /api/leads/:id  { "status": "converted" } and/or { "tags": ["priority"] }
//
// Scoped to whichever tenant the logged-in user's session belongs to.
import { runWithTenant } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';

const VALID_STATUSES = ['new', 'contacted', 'won', 'lost'];
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

export async function PATCH(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }
  const tenantId = session.tenantId;

  const { id } = params;
  const { status, tags } = await req.json();

  if (status === undefined && tags === undefined) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 });
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return Response.json({ error: 'Invalid status value' }, { status: 400 });
  }
  if (tags !== undefined) {
    if (
      !Array.isArray(tags) ||
      tags.length > MAX_TAGS ||
      tags.some((t) => typeof t !== 'string' || t.length === 0 || t.length > MAX_TAG_LENGTH)
    ) {
      return Response.json({ error: `tags must be an array of up to ${MAX_TAGS} strings, each under ${MAX_TAG_LENGTH} characters` }, { status: 400 });
    }
  }

  // Build the SET clause from whichever fields were actually provided,
  // rather than two near-identical queries for "status only" / "tags only".
  const setClauses = [];
  const values = [];
  if (status !== undefined) {
    values.push(status);
    setClauses.push(`status = $${values.length}`);
  }
  if (tags !== undefined) {
    values.push(tags);
    setClauses.push(`tags = $${values.length}`);
  }
  values.push(id);

  try {
    const result = await runWithTenant(tenantId, (client) =>
      client.query(
        `UPDATE leads SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING id`,
        values
      )
    );

    if (result.rowCount === 0) {
      // RLS will silently return 0 rows if this tenant doesn't own the lead
      return Response.json({ error: 'Lead not found' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('Lead update error:', err.message, { tenantId, leadId: id });
    return Response.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}
