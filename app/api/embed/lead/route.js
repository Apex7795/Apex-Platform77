// app/api/embed/lead/route.js
// POST /api/embed/lead -- the endpoint public/widget.js calls from
// whatever third-party website it's embedded on. Deliberately public, no
// session: the entire point is that a stranger visiting a tenant's own
// website (not this platform) can submit a quote request. tenant_id
// comes from the request body (burned into the tenant's copy of the
// widget's script tag) rather than a session, since there IS no session
// for an anonymous visitor on someone else's site.
//
// This is intentionally the ONE place in the app that lets a caller pick
// which tenant to write to by ID with zero authentication -- acceptable
// here because all it can do is create a single 'new' lead row for a
// tenant that must already exist; it can't read, update, or delete
// anything, and can't target a tenant that doesn't exist.
//
// NOT rate-limited or spam-filtered (no captcha, no abuse throttling) --
// worth adding before this sees real traffic at scale, out of scope for
// this first version.
import { pool, runWithTenant } from '../../../../lib/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
  }

  const { tenantId, name, phone, message } = body || {};

  if (!tenantId || !name || !phone) {
    return Response.json(
      { error: 'tenantId, name, and phone are all required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  // Generous but real caps -- this is an unauthenticated public endpoint,
  // no reason to accept multi-megabyte payloads for a quote-request form.
  if (name.length > 200 || phone.length > 50 || (message && message.length > 2000)) {
    return Response.json({ error: 'One or more fields is too long' }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    // tenants has no RLS -- confirming the tenant actually exists before
    // writing anything, so a stale/typo'd tenantId in an old embed snippet
    // fails cleanly instead of silently creating an orphaned-looking lead.
    const { rows } = await pool.query('SELECT 1 FROM tenants WHERE id = $1', [tenantId]);
    if (rows.length === 0) {
      return Response.json({ error: 'Unknown tenant' }, { status: 404, headers: CORS_HEADERS });
    }

    await runWithTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO leads (tenant_id, source, caller_number, status, form_data)
         VALUES ($1, 'form', $2, 'new', $3::jsonb)`,
        [tenantId, phone, JSON.stringify({ name, message: message || null })]
      )
    );

    return Response.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error('Embed widget lead error:', err.message, { tenantId });
    return Response.json({ error: 'Failed to submit' }, { status: 500, headers: CORS_HEADERS });
  }
}
