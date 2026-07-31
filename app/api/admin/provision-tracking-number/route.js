// app/api/admin/provision-tracking-number/route.js
// GET /api/admin/provision-tracking-number?token=...&email=you@example.com&areaCode=916
// Browser-visitable, same bootstrap pattern as /api/admin/promote: the
// piece that was missing wasn't the code that answers calls on a tracking
// number (app/api/twilio/voice, sms-inbound, recording-status all already
// existed) -- it was the code that actually buys a number from Twilio and
// registers it. This is that step. Costs a small real monthly fee on the
// Twilio account the moment it succeeds, same as buying any Twilio number
// would from the Twilio console directly -- this doesn't create money out
// of nowhere, it just automates the console click.
import { Pool } from 'pg';
import crypto from 'crypto';
import twilio from 'twilio';

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
  const areaCode = searchParams.get('areaCode') || '916';
  const forwardsToOverride = searchParams.get('forwardsTo');

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
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return new Response('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are not set.', { status: 503 });
  }
  if (!process.env.WEBHOOK_URL) {
    return new Response('WEBHOOK_URL is not set -- needed so Twilio knows where to send calls.', { status: 503 });
  }
  if (!process.env.MIGRATION_DATABASE_URL) {
    return new Response('MIGRATION_DATABASE_URL is not set.', { status: 503 });
  }

  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    const { rows: userRows } = await pool.query(
      `SELECT t.id AS tenant_id, t.business_name, t.owner_phone
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1`,
      [email]
    );
    if (userRows.length === 0) {
      return new Response(`No user found with email ${email}.`, { status: 404 });
    }
    const { tenant_id: tenantId, business_name: businessName, owner_phone: ownerPhone } = userRows[0];
    const forwardsTo = forwardsToOverride || ownerPhone;

    // Idempotency: don't buy a second number if this tenant already has an
    // active one -- just report it back instead.
    const { rows: existing } = await pool.query(
      `SELECT phone_number FROM tracking_numbers WHERE tenant_id = $1 AND is_active = true LIMIT 1`,
      [tenantId]
    );
    if (existing.length > 0) {
      return new Response(
        `${businessName} already has an active tracking number: ${existing[0].phone_number}\n\nThat's the one to use in ads -- no need to buy another.`,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const available = await client.availablePhoneNumbers('US').local.list({
      areaCode: Number(areaCode),
      smsEnabled: true,
      voiceEnabled: true,
      limit: 1,
    });
    if (available.length === 0) {
      return new Response(
        `No available Twilio numbers found in area code ${areaCode}. Try a different one, e.g. ?areaCode=209`,
        { status: 404 }
      );
    }

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: available[0].phoneNumber,
      voiceUrl: `${process.env.WEBHOOK_URL}/api/twilio/voice`,
      voiceMethod: 'POST',
      smsUrl: `${process.env.WEBHOOK_URL}/api/twilio/sms-inbound`,
      smsMethod: 'POST',
    });

    await pool.query(
      `INSERT INTO tracking_numbers (tenant_id, twilio_sid, phone_number, forwards_to)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, purchased.sid, purchased.phoneNumber, forwardsTo]
    );

    return new Response(
      `New tracking number for ${businessName}: ${purchased.phoneNumber}\n\nCalls to this number ring through to ${forwardsTo} and automatically log as a lead in your dashboard. Use THIS number (not your personal cell) in the Meta ad's "Call now" button.`,
      { headers: { 'Content-Type': 'text/plain' } }
    );
  } catch (err) {
    console.error('Provision tracking number error:', err.message, { email, areaCode });
    return new Response(`Failed: ${err.message}`, { status: 500 });
  } finally {
    await pool.end();
  }
}
