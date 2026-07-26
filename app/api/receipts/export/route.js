// app/api/receipts/export/route.js
// GET /api/receipts/export?year=2026 -- CSV download of a tenant's real
// receipts for a given year, for their own tax records. Real stored data
// only, no fabricated rows.
import { runWithTenant } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') || new Date().getFullYear();

  try {
    const receipts = await runWithTenant(session.tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, customer_name, final_price_cents, notes, completed_at
         FROM receipts
         WHERE EXTRACT(YEAR FROM completed_at) = $1
         ORDER BY completed_at ASC`,
        [year]
      );
      return rows;
    });

    const header = ['Date', 'Receipt ID', 'Customer', 'Amount', 'Notes'];
    const rows = receipts.map((r) => [
      new Date(r.completed_at).toISOString().split('T')[0],
      r.id,
      r.customer_name || '',
      (r.final_price_cents / 100).toFixed(2),
      r.notes || '',
    ]);
    const total = receipts.reduce((sum, r) => sum + r.final_price_cents, 0);
    rows.push([]);
    rows.push(['', '', '', 'TOTAL', (total / 100).toFixed(2)]);

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="apex-receipts-${year}.csv"`,
      },
    });
  } catch (err) {
    console.error('Receipt export error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to export receipts' }, { status: 500 });
  }
}
