// app/api/health/db/route.js
// GET /api/health/db -- a definitive, unambiguous answer to "does THIS
// specific deployment have a working database connection," visitable
// directly in a browser with zero dashboard navigation. Every service
// deployed from this repo/branch runs identical code, which is exactly
// why distinguishing "which service is real" by browsing around has kept
// failing -- this exists so that question never needs guessing again.
import { pool } from '../../../../lib/db';

export async function GET() {
  try {
    const { rows } = await pool.query('SELECT current_database() AS db, current_user AS role');
    return Response.json({
      database: 'connected',
      currentDatabase: rows[0].db,
      currentRole: rows[0].role,
    });
  } catch (err) {
    return Response.json(
      {
        database: 'error',
        message: err.message,
      },
      { status: 500 }
    );
  }
}
