// app/api/billing/checkout/route.js
// POST /api/billing/checkout -- creates a Stripe-hosted Checkout session for
// the logged-in tenant's subscription and returns the URL to redirect to.
// Requires a real session (this is a paying-customer action, not public).
import { pool } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';
import { getStripe } from '../../../../lib/stripe';

export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  if (!process.env.STRIPE_PRICE_ID || !process.env.APP_URL) {
    console.error('billing/checkout: STRIPE_PRICE_ID/APP_URL not configured');
    return Response.json({ error: 'Billing is not configured yet' }, { status: 503 });
  }

  try {
    // tenants has no RLS -- plain lookup is fine, same reasoning as the
    // subdomain-uniqueness check in signup.
    const { rows } = await pool.query(
      'SELECT owner_email, stripe_customer_id FROM tenants WHERE id = $1',
      [session.tenantId]
    );
    const tenant = rows[0];
    if (!tenant) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      // Reuse the existing Stripe customer on re-subscribe (e.g. after a
      // canceled plan) instead of creating a duplicate customer record.
      customer: tenant.stripe_customer_id || undefined,
      customer_email: tenant.stripe_customer_id ? undefined : tenant.owner_email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      metadata: { tenant_id: session.tenantId },
      subscription_data: { trial_period_days: 14 },
      // Lets a customer type in a Stripe promotion code at checkout (e.g.
      // a longer trial for Facebook group members) without any app code
      // change per promo -- the code itself is managed entirely in Stripe.
      allow_promotion_codes: true,
      success_url: `${process.env.APP_URL}/dashboard?billing=success`,
      cancel_url: `${process.env.APP_URL}/dashboard?billing=canceled`,
    });

    return Response.json({ url: checkoutSession.url });
  } catch (err) {
    console.error('Checkout session error:', err.message);
    return Response.json({ error: 'Failed to start checkout' }, { status: 500 });
  }
}
