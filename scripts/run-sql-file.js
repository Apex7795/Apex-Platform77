// scripts/run-sql-file.js
// Runs a raw .sql file against MIGRATION_DATABASE_URL using the `pg` driver
// directly, so Pre-Deploy Command doesn't depend on a `psql` binary being
// present in the deploy environment (native Node buildpack doesn't have one;
// only the Docker image does).
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/run-sql-file.js <path/to/file.sql>');
  process.exit(1);
}

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  console.error('MIGRATION_DATABASE_URL is not set');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(filePath), 'utf8');
const pool = new Pool({ connectionString });

pool
  .query(sql)
  .then(() => {
    console.log(`--- ${filePath} applied successfully ---`);
    return pool.end();
  })
  .catch((err) => {
    console.error(`${filePath} failed:`, err.message);
    return pool.end().finally(() => process.exit(1));
  });
