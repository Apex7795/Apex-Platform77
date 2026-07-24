// scripts/reset-password.js
// Sets a known password for an existing user -- there's no self-serve
// "forgot password" flow yet, so this is the manual escape hatch (run
// from Render's Shell tab) when someone's locked out of an account that
// already exists.
//
// Uses MIGRATION_DATABASE_URL (the owner/admin-privileged connection),
// same reasoning as scripts/promote-admin.js: app_user's RLS grant on
// `users` is scoped by tenant context this script doesn't have.
//
// Usage (e.g. from Render's Shell tab):
//   node scripts/reset-password.js you@yourbusiness.com NewPassword123
const { Pool } = require('pg');
const { hashPassword } = require('../lib/session');

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node scripts/reset-password.js <email> <newPassword>');
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  console.error('MIGRATION_DATABASE_URL is not set');
  process.exit(1);
}

const passwordHash = hashPassword(newPassword);
const pool = new Pool({ connectionString });

pool
  .query(`UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email, tenant_id, role`, [
    passwordHash,
    email,
  ])
  .then(({ rows }) => {
    if (rows.length === 0) {
      console.error(`No user found with email ${email} -- check the email is correct, or sign up first.`);
      process.exitCode = 1;
    } else {
      console.log(`Password reset for:`, rows[0]);
      console.log('You can log in with the new password now.');
    }
    return pool.end();
  })
  .catch((err) => {
    console.error('Password reset failed:', err.message);
    return pool.end().finally(() => process.exit(1));
  });
