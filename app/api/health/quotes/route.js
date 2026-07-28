// app/api/health/quotes/route.js
// GET /api/health/quotes -- definitive, visitable-in-a-browser answer to
// "why does the photo quote estimator fail," same reasoning as
// /api/health/db and /api/health/prospecting. The client-facing error
// from /api/quotes/analyze is deliberately generic ("Failed to analyze
// photos"), so the real cause (missing key, bad key, missing table) only
// ever showed up in server logs -- this makes it checkable directly
// instead of requiring a log dig every time this comes up.
import { pool } from '../../../../lib/db';

// See app/api/health/db/route.js -- without this, Next.js can freeze
// this route's response at build time and never re-check env vars again.
export const dynamic = 'force-dynamic';

export async function GET() {
  const env = {
    OPENAI_API_KEY_set: Boolean(process.env.OPENAI_API_KEY),
  };

  const schema = {};
  try {
    const { rows } = await pool.query(`
      SELECT
        to_regclass('public.quotes') IS NOT NULL AS quotes_table,
        to_regclass('public.usage_credits') IS NOT NULL AS usage_credits_table
    `);
    schema.quotes_table = rows[0].quotes_table;
    schema.usage_credits_table = rows[0].usage_credits_table;
  } catch (err) {
    schema.error = err.message;
  }

  // A live OpenAI call would cost real money and isn't needed to diagnose
  // "is it configured at all" -- if OPENAI_API_KEY_set is true here but
  // quotes still fail, the next most likely cause is the key itself being
  // invalid/expired/over quota, which only shows up as the actual error
  // in server logs when a real request is made.
  return Response.json({ env, schema });
}
