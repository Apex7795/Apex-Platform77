// scripts/promote-admin.js
// One-time promotion of an existing user to role = 'admin', giving them
// the platform-owner view at /admin (see app/api/admin/tenants/route.js).
// Nobody starts as admin -- sign up normally first, then run this once.
//
// Uses MIGRATION_DATABASE_URL (the owner/admin-privileged connection),
// not DATABASE_URL: app_user's RLS grant on `users` is DML-only and
// scoped by tenant context, neither of which this needs or should have.
//
// Usage (e.g. from Render's Shell tab):
//   node scripts/promote-admin.js you@yourbusiness.com
const { Pool } = require('pg');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/promote-admin.js <email>');
  process.exit(1);
}

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  console.error('MIGRATION_DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });

pool
  .query(`UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, email, tenant_id`, [email])
  .then(({ rows }) => {
    if (rows.length === 0) {
      console.error(`No user found with email ${email} -- sign up first, then run this.`);
      process.exitCode = 1;
    } else {
      console.log(`Promoted to admin:`, rows[0]);
      console.log('Log out and back in for the new role to take effect (the session token carries the old role until then).');
    }
    return pool.end();
  })
  .catch((err) => {
    console.error('Promotion failed:', err.message);
    return pool.end().finally(() => process.exit(1));
  });
