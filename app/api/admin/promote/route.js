// app/api/admin/promote/route.js
// GET /api/admin/promote?email=you@example.com&token=...
// Browser-visitable version of scripts/promote-admin.js, for the exact
// same bootstrap problem the other admin/* browser tools solve tonight:
// no admin account exists yet, so the normal session-based admin auth
// can't apply here -- this is the one true chicken-and-egg step, gated
// instead by ADMIN_API_TOKEN passed as a query param (not a header,
// since a plain URL visit can't set one). Query-param tokens are weaker
// than header-based auth (can end up in browser history/server logs),
// acceptable ONLY because this is a narrow one-time bootstrap action,
// not a standing public API -- rotate ADMIN_API_TOKEN afterward if that
// matters to you.
import { Pool } from 'pg';
import crypto from 'crypto';

// See app/api/health/db/route.js -- without this, Next.js can freeze
// this route (including its ADMIN_API_TOKEN comparison) at build time
// and never re-check the real env var again on later requests.
export const dynamic = 'force-dynamic';

function timingSafeStringEqual(a, b) {
  const aBuf = Buffer.from(a || '', 'utf8');
  const bBuf = Buffer.from(b || '', 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  // .trim() because Render's Environment tab has repeatedly captured a
  // trailing newline/whitespace character from mobile copy-paste (see
  // /api/health/admin-token) -- the token value itself has been correct
  // every time, only invisible whitespace around it varies.
  const configuredToken = (process.env.ADMIN_API_TOKEN || '').trim();
  if (!configuredToken) {
    return new Response('ADMIN_API_TOKEN is not set -- cannot authorize this action.', { status: 503 });
  }
  if (!token || !timingSafeStringEqual(token.trim(), configuredToken)) {
    return new Response('Unauthorized -- missing or incorrect token.', { status: 401 });
  }
  if (!email) {
    return new Response('Add ?email=you@example.com to the URL.', { status: 400 });
  }
  if (!process.env.MIGRATION_DATABASE_URL) {
    return new Response('MIGRATION_DATABASE_URL is not set.', { status: 503 });
  }

  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, email, tenant_id`,
      [email]
    );
    if (rows.length === 0) {
      return new Response(`No user found with email ${email} -- sign up first, then try again.`, { status: 404 });
    }
    return new Response(
      `Promoted to admin: ${rows[0].email} (user id ${rows[0].id}).\n\nLog out and back in on the site for the new role to take effect -- your existing session cookie still carries the old role until then.`,
      { headers: { 'Content-Type': 'text/plain' } }
    );
  } catch (err) {
    console.error('Admin promotion error:', err.message);
    return new Response(`Failed: ${err.message}`, { status: 500 });
  } finally {
    await pool.end();
  }
}
