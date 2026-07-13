import { pool } from '@/lib/db';
import { isAuthorized } from '@/lib/auth';
import { payoutCommission } from '@/lib/integrations/stripe';

export async function POST(request, { params }) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { destination_account_id } = await request.json();
  if (!destination_account_id) {
    return Response.json({ error: 'destination_account_id is required' }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT id, commission_amount, status, stripe_transfer_id FROM booked_jobs WHERE id = $1`,
    [id]
  );

  if (rows.length === 0) {
    return Response.json({ error: 'Booked job not found' }, { status: 404 });
  }

  const job = rows[0];
  if (job.stripe_transfer_id) {
    return Response.json({ error: 'Commission already paid out' }, { status: 409 });
  }

  try {
    const transfer = await payoutCommission({
      amount: Number(job.commission_amount),
      destinationAccountId: destination_account_id,
      description: `Commission payout for booked job ${job.id}`,
    });

    await pool.query(
      `UPDATE booked_jobs SET status = 'paid', paid_at = now(), stripe_transfer_id = $2 WHERE id = $1`,
      [id, transfer.id]
    );

    return Response.json({ id: job.id, stripe_transfer_id: transfer.id, status: 'paid' });
  } catch (error) {
    console.error('Stripe payout error:', error);
    return Response.json({ error: error.message }, { status: 502 });
  }
}
