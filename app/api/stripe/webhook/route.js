import Stripe from 'stripe';
import { pool } from '@/lib/db';

export async function POST(request) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  const body = await request.text();
  let event;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'transfer.reversed') {
    const transfer = event.data.object;
    await pool.query(
      `UPDATE booked_jobs SET status = 'payout_reversed' WHERE stripe_transfer_id = $1`,
      [transfer.id]
    );
  }

  return Response.json({ received: true });
}
