// app/api/billing/credits/checkout/route.js
// POST { "feature": "photo_quote" | "prospecting_search" }
// One-time (mode: 'payment', not 'subscription') Stripe Checkout session
// for a credit pack, once a tenant has used up that feature's monthly
// free allowance. Separate price IDs/products from the main subscription
// price -- these are configured in Stripe as one-time products, not
// recurring.
import { pool } from '../../../../../lib/db';
import { getSessionFromRequest } from '../../../../../lib/session';
import { getStripe } from '../../../../../lib/stripe';
import { CREDIT_PACK_SIZE } from '../../../../../lib/usageCredits';

const PRICE_ENV_VAR = {
  photo_quote: 'STRIPE_PHOTO_QUOTE_CREDITS_PRICE_ID',
  prospecting_search: 'STRIPE_PROSPECTING_CREDITS_PRICE_ID',
};

export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { feature } = body || {};
  if (!PRICE_ENV_VAR[feature]) {
    return Response.json({ error: 'Invalid feature' }, { status: 400 });
  }

  const priceId = process.env[PRICE_ENV_VAR[feature]];
  if (!priceId || !process.env.APP_URL) {
    console.error(`billing/credits/checkout: ${PRICE_ENV_VAR[feature]}/APP_URL not configured`);
    return Response.json({ error: 'Credit purchases are not configured yet' }, { status: 503 });
  }

  try {
    const { rows } = await pool.query(
      'SELECT owner_email, stripe_customer_id FROM tenants WHERE id = $1',
      [session.tenantId]
    );
    const tenant = rows[0];
    if (!tenant) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer: tenant.stripe_customer_id || undefined,
      customer_email: tenant.stripe_customer_id ? undefined : tenant.owner_email,
      line_items: [{ price: priceId, quantity: 1 }],
      // Read by the webhook to know this is a credit-pack purchase (not
      // the subscription flow) and how many credits to grant, to which
      // tenant, for which feature.
      metadata: {
        type: 'credit_pack',
        tenant_id: session.tenantId,
        feature,
        credits: String(CREDIT_PACK_SIZE[feature]),
      },
      success_url: `${process.env.APP_URL}/dashboard?credits=success`,
      cancel_url: `${process.env.APP_URL}/dashboard?credits=canceled`,
    });

    return Response.json({ url: checkoutSession.url });
  } catch (err) {
    console.error('Credit checkout error:', err.message);
    return Response.json({ error: 'Failed to start checkout' }, { status: 500 });
  }
}
