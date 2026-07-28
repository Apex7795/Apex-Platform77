// app/api/admin/rotate-app-user-password/route.js
// GET /api/admin/rotate-app-user-password -- visit this URL in a browser
// (while logged in as an admin) instead of typing psql commands into
// Render's Shell tab, which has proven painful to use on mobile tonight.
//
// Generates a real random password, sets it on the `app_user` Postgres
// role via MIGRATION_DATABASE_URL (the owner-privileged connection --
// app_user itself deliberately can't do this), and returns the exact new
// DATABASE_URL value as plain text -- copy that whole response and paste
// it as DATABASE_URL's value in Render's Environment tab. Does NOT touch
// MIGRATION_DATABASE_URL or actually change the running app's connection
// itself -- that still requires the manual env var edit + redeploy, same
// as before, just without the Shell typing.
import { Pool } from 'pg';
import crypto from 'crypto';
import { requireAdminAuth } from '../../../../lib/adminAuth';

export async function GET(req) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  if (!process.env.MIGRATION_DATABASE_URL) {
    return new Response('MIGRATION_DATABASE_URL is not set -- cannot rotate the password.', { status: 503 });
  }
  if (!process.env.DATABASE_URL) {
    return new Response('DATABASE_URL is not set -- cannot build the new connection string.', { status: 503 });
  }

  const newPassword = crypto.randomBytes(24).toString('hex');
  const migrationPool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });

  try {
    await migrationPool.query('ALTER ROLE app_user WITH PASSWORD $1', [newPassword]);
  } catch (err) {
    console.error('Failed to rotate app_user password:', err.message);
    return new Response(`Failed to set the password: ${err.message}`, { status: 500 });
  } finally {
    await migrationPool.end();
  }

  // Same transform as the earlier shell one-liner: keep the existing
  // host/database, swap only the credentials.
  const hostAndDb = process.env.DATABASE_URL.replace(/^[a-zA-Z]+:\/\/[^@]+@/, '');
  const newDatabaseUrl = `postgresql://app_user:${newPassword}@${hostAndDb}`;

  return new Response(
    `Password set on app_user successfully.\n\nPaste this exact value as DATABASE_URL in Render's Environment tab (do NOT touch MIGRATION_DATABASE_URL):\n\n${newDatabaseUrl}\n`,
    { headers: { 'Content-Type': 'text/plain' } }
  );
}
