// scripts/list-users.js
// Read-only listing of every registered account -- for figuring out which
// email(s) are already taken, or which account to promote/reset, without
// needing to open a psql session by hand.
//
// Uses MIGRATION_DATABASE_URL, same reasoning as the other scripts/*.js
// admin scripts: this needs to see across all tenants, which app_user's
// RLS grant deliberately does not allow.
//
// Usage (e.g. from Render's Shell tab):
//   node scripts/list-users.js
const { Pool } = require('pg');

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  console.error('MIGRATION_DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });

pool
  .query(
    `SELECT u.email, u.role, u.created_at, t.business_name, t.subdomain
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     ORDER BY u.created_at ASC`
  )
  .then(({ rows }) => {
    if (rows.length === 0) {
      console.log('No users found.');
    } else {
      console.table(rows);
    }
    return pool.end();
  })
  .catch((err) => {
    console.error('Listing users failed:', err.message);
    return pool.end().finally(() => process.exit(1));
  });
