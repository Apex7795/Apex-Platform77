// app/api/health/billing/route.js
// GET /api/health/billing -- same reasoning as the other health/*
// endpoints: "Add payment method" going blank with no visible error
// almost always means Stripe isn't fully configured, not a code bug.
// Reports presence only, never actual key values.

// See app/api/health/db/route.js -- without this, Next.js can freeze
// this route's response at build time and never re-check env vars again.
export const dynamic = 'force-dynamic';

export async function GET() {
  const env = {
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    STRIPE_PRICE_ID: Boolean(process.env.STRIPE_PRICE_ID),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    APP_URL: process.env.APP_URL || null,
  };
  return Response.json({ env });
}
