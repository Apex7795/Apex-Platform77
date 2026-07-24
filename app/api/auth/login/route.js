// app/api/auth/login/route.js
import { pool } from '../../../../lib/db';
import { verifyPassword, createSessionToken, sessionCookieHeader } from '../../../../lib/session';
import { isRateLimited, getClientIp } from '../../../../lib/rateLimit';

// Keyed by IP+email (not IP alone) so a brute-force attempt against one
// account can't also lock out everyone else logging in from behind the
// same NAT/office wifi. 10 attempts/10min is generous for a real typo-prone
// human, tight for a password-guessing script.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, password } = body || {};
  if (!email || !password) {
    return Response.json({ error: 'email and password are required' }, { status: 400 });
  }

  const rateLimitKey = `${getClientIp(req)}:${email.toLowerCase()}`;
  if (isRateLimited('login', rateLimitKey, { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return Response.json({ error: 'Too many login attempts -- please wait a few minutes and try again' }, { status: 429 });
  }

  try {
    // Goes through the get_user_for_login() SECURITY DEFINER function
    // (db/migrate_rls_hardening.sql), not a direct SELECT -- this is an
    // unscoped lookup done before tenant_id is known (that's what it's
    // determining), which app_user's RLS grant deliberately can't do
    // directly against the `users` table.
    const { rows } = await pool.query('SELECT * FROM get_user_for_login($1)', [email]);
    const user = rows[0];

    // Same error for "no such user" and "wrong password" -- don't leak
    // which one it was.
    if (!user || !verifyPassword(password, user.password_hash)) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const token = createSessionToken({ userId: user.id, tenantId: user.tenant_id, role: user.role });

    return Response.json(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      { headers: { 'Set-Cookie': sessionCookieHeader(token) } }
    );
  } catch (err) {
    console.error('Login error:', err.message);
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
}
