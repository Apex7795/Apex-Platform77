import twilio from 'twilio';
import { pool } from '@/lib/db';
import { validateWebhookRequest } from '@/lib/integrations/twilio';

export async function POST(request) {
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries());

  if (!validateWebhookRequest(request, params)) {
    return new Response('Forbidden', { status: 403 });
  }

  const from = params.From;
  const tenantId = process.env.PROSPECTING_HOUSE_TENANT_ID;

  const { rows } = await pool.query(
    `SELECT l.id, p.name AS prospect_name
     FROM leads l
     LEFT JOIN prospects p ON p.id = l.prospect_id
     WHERE l.tenant_id = $1 AND l.phone = $2
     ORDER BY l.created_at DESC
     LIMIT 1`,
    [tenantId, from]
  );

  const lead = rows[0];
  const { VoiceResponse } = twilio.twiml;
  const response = new VoiceResponse();

  if (lead) {
    response.say(
      `Welcome back${lead.prospect_name ? ', caller from ' + lead.prospect_name : ''}. Connecting you now.`
    );
  } else {
    await pool.query(
      `INSERT INTO leads (tenant_id, phone, status) VALUES ($1, $2, 'active')`,
      [tenantId, from]
    );
    response.say('Thanks for calling. Connecting you to the next available agent.');
  }

  const forwardingNumber = process.env.FORWARDING_PHONE_NUMBER;
  if (forwardingNumber) {
    response.dial(forwardingNumber);
  }

  return new Response(response.toString(), { headers: { 'Content-Type': 'text/xml' } });
}
