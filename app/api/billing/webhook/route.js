// app/api/billing/webhook/route.js
// POST /api/billing/webhook -- Stripe calls this directly (configure the
// URL in Stripe Dashboard -> Developers -> Webhooks). Keeps
// tenants.subscription_status in sync with what Stripe actually thinks is
// happening, so app access can be gated on it.
//
// Needs the RAW request body for signature verification -- req.text(),
// not req.json(), same reasoning Twilio's routes use req.text() before
// re-parsing, except here the raw bytes themselves (not a re-encoded
// version) must match exactly what Stripe signed.
import { pool } from '../../../../lib/db';
import { getStripe } from '../../../../lib/stripe';

export async function POST(req) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('billing/webhook: STRIPE_WEBHOOK_SECRET is not set');
    return new Response('Webhook not configured', { status: 503 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkoutSession = event.data.object;
        await pool.query(
          `UPDATE tenants
           SET stripe_customer_id = $1, stripe_subscription_id = $2, subscription_status = 'trialing', updated_at = now()
           WHERE id = $3`,
          [checkoutSession.customer, checkoutSession.subscription, checkoutSession.metadata.tenant_id]
        );
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await pool.query(
          `UPDATE tenants SET subscription_status = $1, updated_at = now() WHERE stripe_subscription_id = $2`,
          [subscription.status, subscription.id]
        );
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await pool.query(
          `UPDATE tenants SET subscription_status = 'canceled', updated_at = now() WHERE stripe_subscription_id = $1`,
          [subscription.id]
        );
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await pool.query(
          `UPDATE tenants SET subscription_status = 'past_due', updated_at = now() WHERE stripe_customer_id = $1`,
          [invoice.customer]
        );
        break;
      }
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handling error:', err.message, { type: event.type });
    return new Response('Webhook handler failed', { status: 500 });
  }
}
