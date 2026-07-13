import { pool } from '@/lib/db';
import { isAuthorized } from '@/lib/auth';

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenant_id') || process.env.PROSPECTING_HOUSE_TENANT_ID;
  const minScore = searchParams.get('min_score');

  const conditions = ['tenant_id = $1'];
  const values = [tenantId];
  if (minScore) {
    values.push(Number(minScore));
    conditions.push(`conversion_score >= $${values.length}`);
  }

  const result = await pool.query(
    `SELECT id, name, rating, review_count, conversion_score, conversion_probability, hiring_trend, email, created_at
     FROM prospects
     WHERE ${conditions.join(' AND ')}
     ORDER BY conversion_score DESC
     LIMIT 200`,
    values
  );

  return Response.json({ prospects: result.rows });
}
