import { pool } from '@/lib/db';
import { isAuthorized } from '@/lib/auth';

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  const email = searchParams.get('email');
  const tenantId = searchParams.get('tenant_id') || process.env.PROSPECTING_HOUSE_TENANT_ID;

  const conditions = ['l.tenant_id = $1'];
  const values = [tenantId];

  if (phone) {
    values.push(phone);
    conditions.push(`l.phone = $${values.length}`);
  }
  if (email) {
    values.push(email);
    conditions.push(`l.email = $${values.length}`);
  }

  const result = await pool.query(
    `SELECT l.id, l.phone, l.email, l.status, l.created_at, l.updated_at,
            p.id AS prospect_id, p.name AS prospect_name, p.conversion_probability
     FROM leads l
     LEFT JOIN prospects p ON p.id = l.prospect_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY l.created_at DESC
     LIMIT 100`,
    values
  );

  return Response.json({ leads: result.rows });
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { phone, email, prospect_id } = await request.json();
  if (!phone && !email) {
    return Response.json({ error: 'phone or email is required' }, { status: 400 });
  }

  const tenantId = process.env.PROSPECTING_HOUSE_TENANT_ID;

  try {
    const result = await pool.query(
      `INSERT INTO leads (tenant_id, prospect_id, phone, email, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, created_at`,
      [tenantId, prospect_id || null, phone || null, email || null]
    );

    return Response.json(
      { id: result.rows[0].id, created_at: result.rows[0].created_at },
      { status: 201 }
    );
  } catch (error) {
    console.error('Leads API error:', error);
    if (error.code === '23503') {
      return Response.json({ error: 'Invalid prospect_id' }, { status: 400 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
