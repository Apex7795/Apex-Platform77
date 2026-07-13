const twilio = require('twilio');

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Twilio credentials are not configured');
  }
  return twilio(sid, token);
}

async function sendSms({ to, body }) {
  if (!to || !body) {
    throw new Error('to and body are required');
  }

  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error('TWILIO_FROM_NUMBER is not configured');
  }

  const client = getClient();
  return client.messages.create({ to, from, body });
}

// Verifies that an inbound webhook request actually originated from Twilio.
function validateWebhookRequest(request, params) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get('x-twilio-signature');
  if (!authToken || !signature) {
    return false;
  }

  const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL;
  const url = baseUrl ? `${baseUrl}${new URL(request.url).pathname}` : request.url;

  return twilio.validateRequest(authToken, signature, url, params);
}

module.exports = { getClient, sendSms, validateWebhookRequest };
