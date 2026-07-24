// app/api/auth/reset-password/route.js
// POST /api/auth/reset-password -- consumes the link from forgot-password's
// email. tenantId travels inside the signed token itself (set at the time
// the email was sent), so this can go through the normal RLS-scoped
// runWithTenant path instead of needing another SECURITY DEFINER function.
import { runWithTenant } from '../../../../lib/db';
import { hashPassword, verifyPasswordResetToken } from '../../../../lib/session';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, password } = body || {};
  if (!token || !password) {
    return Response.json({ error: 'token and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  try {
    const payload = verifyPasswordResetToken(token);
    if (!payload) {
      return Response.json({ error: 'This reset link is invalid or has expired' }, { status: 400 });
    }

    const passwordHash = hashPassword(password);
    const result = await runWithTenant(payload.tenantId, (client) =>
      client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, payload.userId])
    );

    if (result.rowCount === 0) {
      // User was deleted after the link was sent -- edge case, not a bug.
      return Response.json({ error: 'This reset link is invalid or has expired' }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Reset-password error:', err.message);
    return Response.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
