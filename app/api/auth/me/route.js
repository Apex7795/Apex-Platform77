// app/api/auth/me/route.js
// Lets the frontend check "am I logged in, and as who" on page load.
import { getSessionFromRequest } from '../../../../lib/session';
import { runWithTenant } from '../../../../lib/db';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    // Unlike login, the tenant IS already known here (from the verified
    // session token), so this goes through runWithTenant like any other
    // authenticated route instead of needing a SECURITY DEFINER function.
    const { rows } = await runWithTenant(session.tenantId, (client) =>
      client.query(
        'SELECT u.email, u.role, t.business_name, t.subdomain FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = $1',
        [session.userId]
      )
    );
    const user = rows[0];
    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 });
    }
    return Response.json({
      tenantId: session.tenantId,
      role: session.role,
      email: user.email,
      businessName: user.business_name,
      subdomain: user.subdomain,
    });
  } catch (err) {
    console.error('Session lookup error:', err.message);
    return Response.json({ error: 'Session lookup failed' }, { status: 500 });
  }
}
