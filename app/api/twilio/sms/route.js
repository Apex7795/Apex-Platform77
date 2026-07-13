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

  await pool.query(
    `UPDATE leads SET status = 'active', updated_at = now() WHERE tenant_id = $1 AND phone = $2`,
    [tenantId, from]
  );

  const { MessagingResponse } = twilio.twiml;
  const response = new MessagingResponse();
  response.message('Thanks for the reply! Someone from our team will follow up shortly.');

  return new Response(response.toString(), { headers: { 'Content-Type': 'text/xml' } });
}
