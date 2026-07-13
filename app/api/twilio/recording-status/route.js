// app/api/twilio/recording-status/route.js
import twilio from 'twilio';
import { query, runWithTenant } from '../../../../lib/db';

export async function POST(req) {
  let params;
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-twilio-signature');
    params = Object.fromEntries(new URLSearchParams(rawBody));
    const webhookUrl = `${process.env.WEBHOOK_URL}/api/twilio/recording-status`;

    const isValid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, webhookUrl, params);
    if (!isValid) {
      console.error('Invalid Twilio signature on /recording-status', { webhookUrl });
      return new Response('Invalid signature', { status: 403 });
    }

    const { CallSid, RecordingUrl } = params;
    if (!CallSid || !RecordingUrl) {
      return new Response('Missing CallSid or RecordingUrl', { status: 400 });
    }

    // Uses the get_tenant_for_call_sid() SECURITY DEFINER function instead
    // of a raw SELECT on leads — see db/migrate_rls_hardening.sql. There's
    // no tenant context yet at this point (that's what we're resolving),
    // and leads is under strict RLS, so a raw query here would return 0
    // rows once RLS is actually enforced.
    const { rows } = await query('SELECT get_tenant_for_call_sid($1) AS tenant_id', [CallSid]);
    const tenantId = rows[0]?.tenant_id;

    if (!tenantId) {
      // Log the orphan rather than silently ignoring it — makes "where did
      // this recording go?" debugging trivial later.
      console.error('No lead found for recording callback', { CallSid });
      return new Response('OK', { status: 200 }); // still 200 so Twilio doesn't retry forever
    }

    await runWithTenant(tenantId, (client) =>
      client.query('UPDATE leads SET recording_url = $1 WHERE call_sid = $2', [`${RecordingUrl}.mp3`, CallSid])
    );

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Recording status webhook error:', err.message, { callSid: params?.CallSid });
    return new Response('Error', { status: 500 });
  }
}
