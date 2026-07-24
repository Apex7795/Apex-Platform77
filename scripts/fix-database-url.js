// scripts/fix-database-url.js
// One-time repair for a DATABASE_URL env var that was left as a literal
// placeholder ("<copy from old service>") instead of a real connection
// string -- which breaks every live request (login, signup, leads) since
// lib/db.js's pool is built directly from DATABASE_URL, even though
// migrations/admin scripts kept working fine off MIGRATION_DATABASE_URL.
//
// Deliberately resets app_user's password (rather than asking anyone to
// hunt down a possibly-forgotten one) and derives the correct DATABASE_URL
// from MIGRATION_DATABASE_URL's own host/port/db/sslmode -- so DATABASE_URL
// keeps using the RLS-restricted app_user role, not the admin role, same
// tenant-isolation guarantee the rest of this codebase depends on.
//
// Usage (e.g. via the Pre-Deploy Command, same trick used earlier today):
//   node scripts/fix-database-url.js
const crypto = require('crypto');
const { Pool } = require('pg');

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!migrationUrl) {
  console.error('MIGRATION_DATABASE_URL is not set -- cannot proceed');
  process.exit(1);
}

const newPassword = crypto.randomBytes(18).toString('base64url');

const pool = new Pool({ connectionString: migrationUrl });

pool
  .query(`ALTER ROLE app_user WITH PASSWORD '${newPassword}'`)
  .then(() => {
    const parsed = new URL(migrationUrl);
    parsed.username = 'app_user';
    parsed.password = newPassword;
    console.log('=== DATABASE_URL FIX ===');
    console.log('app_user password reset successfully.');
    console.log('Set DATABASE_URL to exactly this value:');
    console.log(parsed.toString());
    console.log('========================');
    return pool.end();
  })
  .catch((err) => {
    console.error('fix-database-url failed:', err.message);
    return pool.end().finally(() => process.exit(1));
  });
