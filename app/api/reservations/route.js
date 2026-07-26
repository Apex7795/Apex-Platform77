// app/api/reservations/route.js
// POST /api/reservations -- public, unauthenticated "reserve a spot"
// capture (e.g. for a Facebook group promo). Deliberately lower-friction
// than real signup: name/email/business, no password, no tenant created.
// Same defensive pattern as app/api/embed/lead/route.js: rate-limited,
// honeypot field, since this is another public write endpoint.
//
// GET is admin-only -- lets you see who reserved a spot, in order, so
// "first 100" can actually be enforced by you when you send out real
// checkout links, without building automatic capacity logic nobody asked
// for yet.
import { pool } from '../../../lib/db';
import { isRateLimited, getClientIp } from '../../../lib/rateLimit';
import { getSessionFromRequest } from '../../../lib/session';

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, phone, businessName, source, website } = body || {};

  // Honeypot -- pretend success, write nothing.
  if (website) {
    return Response.json({ ok: true });
  }

  const ip = getClientIp(req);
  if (isRateLimited('reservations', ip, { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return Response.json({ error: 'Too many submissions -- please try again later' }, { status: 429 });
  }

  if (!name || !email) {
    return Response.json({ error: 'name and email are required' }, { status: 400 });
  }
  if (name.length > 200 || email.length > 200 || (phone && phone.length > 50) || (businessName && businessName.length > 200)) {
    return Response.json({ error: 'One or more fields is too long' }, { status: 400 });
  }

  try {
    await pool.query(
      `INSERT INTO reservations (name, email, phone, business_name, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, email, phone || null, businessName || null, source || null]
    );
    return Response.json({ ok: true });
  } catch (err) {
    console.error('Reservation error:', err.message);
    return Response.json({ error: 'Failed to submit' }, { status: 500 });
  }
}

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, business_name, source, created_at
       FROM reservations ORDER BY created_at ASC`
    );
    return Response.json({ reservations: rows });
  } catch (err) {
    console.error('Reservation list error:', err.message);
    return Response.json({ error: 'Failed to load reservations' }, { status: 500 });
  }
}
