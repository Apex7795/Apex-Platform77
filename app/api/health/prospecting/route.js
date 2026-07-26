// app/api/health/prospecting/route.js
// GET /api/health/prospecting -- a definitive, visitable-in-a-browser
// answer to "are the local-prospecting/Twilio env vars actually set on
// THIS deployment, and did the recent migrations actually land," same
// reasoning as /api/health/db: settle it by checking, not by guessing
// from screenshots. Never returns actual secret values, only booleans/
// non-secret metadata.
import { pool } from '../../../../lib/db';

export async function GET() {
  const env = {
    GOOGLE_PLACES_API_KEY: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    HUNTER_API_KEY: Boolean(process.env.HUNTER_API_KEY),
    TWILIO_ACCOUNT_SID: Boolean(process.env.TWILIO_ACCOUNT_SID),
    TWILIO_AUTH_TOKEN: Boolean(process.env.TWILIO_AUTH_TOKEN),
    // Twilio signature validation (app/api/twilio/voice, sms-inbound)
    // reconstructs the webhook URL from WEBHOOK_URL + the route path and
    // compares it to what Twilio actually signed -- if this still holds
    // the .env.example placeholder or doesn't match where Twilio's
    // console is actually configured to send webhooks, EVERY inbound
    // call/text gets rejected with a 403, silently, since Twilio just
    // sees a failed webhook and retries/gives up.
    WEBHOOK_URL: process.env.WEBHOOK_URL || null,
    WEBHOOK_URL_LOOKS_LIKE_PLACEHOLDER: process.env.WEBHOOK_URL === 'https://app.example.com',
  };

  const schema = {};
  try {
    const { rows } = await pool.query(`
      SELECT
        to_regclass('public.tenant_prospects') IS NOT NULL AS tenant_prospects_table,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leads' AND column_name = 'tags'
        ) AS leads_tags_column
    `);
    schema.tenant_prospects_table = rows[0].tenant_prospects_table;
    schema.leads_tags_column = rows[0].leads_tags_column;

    // Spot-check RLS is actually ON for every tenant-scoped table added
    // this project, not just that the table exists -- a table that
    // exists but never got ALTER TABLE ... ENABLE ROW LEVEL SECURITY
    // would silently let app_user read/write across tenants.
    const { rows: rlsRows } = await pool.query(`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relname IN ('leads', 'quotes', 'receipts', 'tenant_prospects')
    `);
    schema.row_level_security = Object.fromEntries(rlsRows.map((r) => [r.relname, r.relrowsecurity]));
  } catch (err) {
    schema.error = err.message;
  }

  return Response.json({ env, schema });
}
