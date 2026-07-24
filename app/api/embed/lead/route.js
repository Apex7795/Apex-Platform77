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
// This is also the ONLY lead source with an arbitrary, user-typed phone
// number -- call and SMS leads come in through Twilio's own network, which
// already proves the number is live. So this is where phone verification,
// the honeypot, and rate limiting all live.
import { pool, runWithTenant } from '../../../../lib/db';
import { verifyPhoneNumber } from '../../../../lib/twilioLookup';
import { isRateLimited, getClientIp } from '../../../../lib/rateLimit';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

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

  const { tenantId, name, phone, message, website } = body || {};

  // Honeypot: a real visitor never sees or fills this field (hidden via
  // CSS in public/widget.js). A bot filling every input in the form will.
  // Pretend success so the bot doesn't learn to skip the field next time,
  // but don't write anything.
  if (website) {
    return Response.json({ ok: true }, { headers: CORS_HEADERS });
  }

  const ip = getClientIp(req);
  if (isRateLimited('embed_lead', ip, { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return Response.json(
      { error: 'Too many submissions -- please try again later' },
      { status: 429, headers: CORS_HEADERS }
    );
  }

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

    // Twilio Lookup: catches fake/malformed/dead numbers before they ever
    // become a lead a tenant pays for. `verified === false` is a
    // definitive "this number doesn't exist" from Twilio -- reject those
    // outright. `null` means Lookup itself was unreachable (not the
    // number's fault), so let those through unverified rather than
    // blocking real customers over an outage.
    const { verified, lineType } = await verifyPhoneNumber(phone);
    if (verified === false) {
      return Response.json(
        { error: 'That phone number could not be verified -- please double-check it and try again.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    await runWithTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO leads (tenant_id, source, caller_number, status, form_data, phone_verified, phone_line_type, phone_verification_checked_at)
         VALUES ($1, 'form', $2, 'new', $3::jsonb, $4, $5, now())`,
        [tenantId, phone, JSON.stringify({ name, message: message || null }), verified, lineType]
      )
    );

    return Response.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error('Embed widget lead error:', err.message, { tenantId });
    return Response.json({ error: 'Failed to submit' }, { status: 500, headers: CORS_HEADERS });
  }
}
