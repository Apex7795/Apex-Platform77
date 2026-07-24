// app/api/auth/signup/route.js
// Creates a new tenant (business) plus its first user (owner), and logs
// them straight in. This is what makes the platform actually multi-tenant
// instead of the single hardcoded PRIMARY_TENANT_ID every other route
// still falls back to.
import { pool } from '../../../../lib/db';
import { hashPassword, createSessionToken, sessionCookieHeader } from '../../../../lib/session';
import { isRateLimited, getClientIp } from '../../../../lib/rateLimit';

const UNIQUE_VIOLATION = '23505';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { businessName, serviceType, serviceArea, ownerEmail, ownerPhone, password } = body || {};

  if (!businessName || !ownerEmail || !ownerPhone || !password) {
    return Response.json(
      { error: 'businessName, ownerEmail, ownerPhone, and password are all required' },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const ip = getClientIp(req);
  if (isRateLimited('signup', ip, { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return Response.json({ error: 'Too many signup attempts -- please wait a few minutes and try again' }, { status: 429 });
  }

  const baseSlug = slugify(businessName) || 'business';
  const passwordHash = hashPassword(password);

  // Tenant creation and user creation happen in one transaction, on one
  // connection: if the user insert fails (e.g. duplicate email) after the
  // tenant insert succeeded, both must roll back together, or every failed
  // signup attempt would leave an orphaned tenant row with no owner.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find a unique subdomain by appending -2, -3, etc. if the base is
    // taken. tenants has no RLS (it's the root entity, nothing to scope
    // it by), so this plain SELECT is fine pre-transaction-tenant-context.
    let subdomain = baseSlug;
    for (let attempt = 0; attempt < 20; attempt++) {
      const { rows } = await client.query('SELECT 1 FROM tenants WHERE subdomain = $1', [subdomain]);
      if (rows.length === 0) break;
      subdomain = `${baseSlug}-${attempt + 2}`;
    }

    const tenantResult = await client.query(
      `INSERT INTO tenants (business_name, service_type, service_area, subdomain, owner_email, owner_phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [businessName, serviceType || 'general', serviceArea || '', subdomain, ownerEmail, ownerPhone]
    );
    const tenantId = tenantResult.rows[0].id;

    // users is under RLS -- set tenant context on this connection before
    // inserting into it, same mechanism runWithTenant uses, just inline
    // since this transaction also needs the tenant-less work above it.
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', String(tenantId)]);

    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, role, password_hash)
       VALUES ($1, $2, 'owner', $3)
       RETURNING id`,
      [tenantId, ownerEmail, passwordHash]
    );
    const userId = userResult.rows[0].id;

    await client.query('COMMIT');

    const token = createSessionToken({ userId, tenantId, role: 'owner' });

    return Response.json(
      { tenantId, userId, subdomain },
      { status: 201, headers: { 'Set-Cookie': sessionCookieHeader(token) } }
    );
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === UNIQUE_VIOLATION) {
      return Response.json({ error: 'An account with that email already exists' }, { status: 409 });
    }
    console.error('Signup error:', err.message);
    return Response.json({ error: 'Signup failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
