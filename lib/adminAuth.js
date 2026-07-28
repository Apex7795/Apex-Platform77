// lib/adminAuth.js
// Admin authentication for internal-only routes (the prospecting admin
// endpoints — discovery, list, outreach triggers, status updates).
//
// Two accepted credentials, for two different callers:
// 1. A real per-user session (lib/session.js) belonging to a tenant user
//    whose role is 'admin' -- what the browser dashboard uses, so an
//    admin action taken through the UI is attributable to a specific
//    logged-in person instead of "whoever has the shared secret." This is
//    the fix for there being no per-admin individual login -- previously
//    the ONLY accepted credential was the shared token below.
// 2. The shared ADMIN_API_TOKEN bearer token -- kept for server-to-server/
//    script use (scripts/cron.js, one-off curl calls) where there's no
//    browser session to send.
const crypto = require('crypto');
const { getSessionFromRequest } = require('./session');

function timingSafeStringEqual(a, b) {
  const aBuf = Buffer.from(a || '', 'utf8');
  const bBuf = Buffer.from(b || '', 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Call at the top of every admin-only route handler. Returns null if the
 * request is authorized; returns a Response object to send back
 * immediately (unauthorized) otherwise.
 *
 * Usage:
 *   const authError = requireAdminAuth(req);
 *   if (authError) return authError;
 */
function requireAdminAuth(req) {
  const session = getSessionFromRequest(req);
  if (session && session.role === 'admin') {
    // Minimal accountability trail: which logged-in admin user actually
    // triggered this, not just "the shared token was presented."
    console.log('Admin action authorized via session', { userId: session.userId, path: req.url });
    return null;
  }

  // .trim() because Render's Environment tab has repeatedly captured a
  // trailing newline/whitespace character from mobile copy-paste (see
  // /api/health/admin-token) -- the token value itself has been correct
  // every time, only invisible whitespace around it varies.
  const configuredToken = (process.env.ADMIN_API_TOKEN || '').trim() || undefined;
  if (!configuredToken) {
    // Fail closed, not open — a missing env var should not silently
    // disable auth. This is the same "fail closed" principle already
    // applied to the RLS current_setting(..., true) fix.
    console.error('ADMIN_API_TOKEN is not set — refusing all admin requests');
    return new Response(JSON.stringify({ error: 'Admin auth not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token || !timingSafeStringEqual(token.trim(), configuredToken)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null;
}

module.exports = { requireAdminAuth };
