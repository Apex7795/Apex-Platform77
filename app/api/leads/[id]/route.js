import { pool } from '@/lib/db';
import { isAuthorized } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

export async function GET(request, { params }) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return Response.json({ error: 'Invalid lead id' }, { status: 400 });
  }

  const result = await pool.query(
    `SELECT l.*, p.name AS prospect_name, p.conversion_probability
     FROM leads l
     LEFT JOIN prospects p ON p.id = l.prospect_id
     WHERE l.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return Response.json({ error: 'Lead not found' }, { status: 404 });
  }

  return Response.json(result.rows[0]);
}
