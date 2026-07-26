// app/api/receipts/route.js
// GET  /api/receipts -- list this tenant's completed-job receipts, plus a
//      summary (total income, count, average) computed from real stored
//      numbers -- not a fabricated projection, just arithmetic on what's
//      actually in the table.
// POST /api/receipts -- record a completed job's actual final price.
import { runWithTenant } from '../../../lib/db';
import { getSessionFromRequest } from '../../../lib/session';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year');

  try {
    const receipts = await runWithTenant(session.tenantId, async (client) => {
      const { rows } = await client.query(
        year
          ? `SELECT id, lead_id, quote_id, customer_name, final_price_cents, notes, completed_at
             FROM receipts WHERE EXTRACT(YEAR FROM completed_at) = $1
             ORDER BY completed_at DESC`
          : `SELECT id, lead_id, quote_id, customer_name, final_price_cents, notes, completed_at
             FROM receipts ORDER BY completed_at DESC LIMIT 100`,
        year ? [year] : []
      );
      return rows;
    });

    const totalCents = receipts.reduce((sum, r) => sum + r.final_price_cents, 0);
    const summary = {
      count: receipts.length,
      totalCents,
      averageCents: receipts.length ? Math.round(totalCents / receipts.length) : 0,
    };

    return Response.json({ receipts, summary });
  } catch (err) {
    console.error('Receipt list error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to fetch receipts' }, { status: 500 });
  }
}

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

  const { leadId, quoteId, customerName, finalPriceCents, notes, completedAt } = body || {};

  if (!finalPriceCents || typeof finalPriceCents !== 'number' || finalPriceCents <= 0) {
    return Response.json({ error: 'finalPriceCents must be a positive number (in cents)' }, { status: 400 });
  }
  if (customerName && customerName.length > 200) {
    return Response.json({ error: 'customerName is too long' }, { status: 400 });
  }
  if (notes && notes.length > 2000) {
    return Response.json({ error: 'notes is too long' }, { status: 400 });
  }

  try {
    const { rows } = await runWithTenant(session.tenantId, (client) =>
      client.query(
        `INSERT INTO receipts (tenant_id, lead_id, quote_id, customer_name, final_price_cents, notes, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))
         RETURNING id, completed_at`,
        [session.tenantId, leadId || null, quoteId || null, customerName || null, finalPriceCents, notes || null, completedAt || null]
      )
    );

    return Response.json({ id: rows[0].id, completedAt: rows[0].completed_at }, { status: 201 });
  } catch (err) {
    console.error('Receipt create error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to save receipt' }, { status: 500 });
  }
}
