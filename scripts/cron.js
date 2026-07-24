// scripts/cron.js
// Standalone scheduler process for the background jobs. Run this as its own
// process/container alongside the Next.js app — Next.js API routes are
// request/response and don't stay alive to host a cron scheduler
// themselves, so this is a separate `node scripts/cron.js` process.
//
// IMPORTANT — run exactly ONE instance of this process. If you scale this
// script horizontally the same way you might scale the web app, every
// instance fires these jobs independently and tenants get duplicate SMS
// and duplicate outreach emails. This is enforced below with a Postgres
// advisory lock: a second instance (e.g. the old container still finishing
// during a deploy) will fail to acquire the lock and exit immediately
// instead of running jobs in parallel with the instance that already holds it.
require('dotenv').config();
const cron = require('node-cron');
const { pool } = require('../lib/db');
const { runLeadRescueJob } = require('../jobs/leadRescue');
const { runDailyDigestJob } = require('../jobs/dailyDigest');
const { runProspectDiscoveryJob } = require('../jobs/prospectDiscovery');
const { runProspectHygieneJob } = require('../jobs/prospectHygiene');

const LOCK_ID = 1000;

// pg_try_advisory_lock/pg_advisory_unlock are scoped to the session (the
// physical connection), not the query. Using pool.query() for acquire and
// release would check a connection back into the pool between the two
// calls, so they could land on different connections and the unlock would
// silently no-op, leaking the lock. Holding one dedicated client for the
// life of the process avoids that.
let lockClient;

async function acquireSingletonLock() {
  lockClient = await pool.connect();
  const { rows } = await lockClient.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK_ID]);
  if (!rows[0].acquired) {
    lockClient.release();
    lockClient = null;
    return false;
  }
  return true;
}

async function releaseSingletonLock() {
  if (!lockClient) return;
  try {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
  } finally {
    lockClient.release();
    lockClient = null;
  }
}

function scheduleJobs() {
  // Lead rescue: every 5 minutes, matches the 5-minute/2-hour staging logic
  // inside jobs/leadRescue.js itself.
  cron.schedule('*/5 * * * *', () => {
    runLeadRescueJob().catch((err) => console.error('leadRescue cron run failed:', err));
  });

  // Daily digest: fixed 8am server time for now. jobs/dailyDigest.js's own
  // comments note that per-tenant local-8am filtering would need an hourly
  // run + a timezone column on tenants — not implemented here, matching
  // what was already true of the job itself.
  cron.schedule('0 8 * * *', () => {
    runDailyDigestJob().catch((err) => console.error('dailyDigest cron run failed:', err));
  });

  // Prospect discovery: once daily, early morning. Cities and search
  // terms come from TARGET_SERVICE_AREAS / TARGET_PROSPECT_QUERIES (see
  // jobs/prospectDiscovery.js) -- set those in the environment instead of
  // hardcoding a list here, so this actually covers everywhere/everything
  // you've configured rather than one fixed city and search term.
  cron.schedule('0 6 * * *', () => {
    runProspectDiscoveryJob().catch((err) =>
      console.error('prospectDiscovery cron run failed:', err)
    );
  });

  // Prospect data hygiene: weekly, Sunday 2am — refreshes stale enrichment
  // data (30+ days old), respecting opt-out status. See jobs/prospectHygiene.js.
  cron.schedule('0 2 * * 0', () => {
    runProspectHygieneJob().catch((err) => console.error('prospectHygiene cron run failed:', err));
  });

  console.log(
    'Cron worker started: leadRescue (*/5 min), dailyDigest (8am), prospectDiscovery (6am), prospectHygiene (Sun 2am)'
  );
}

async function shutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}, releasing lock...`);
  await releaseSingletonLock();
  await pool.end();
  process.exit(0);
}

async function main() {
  const acquired = await acquireSingletonLock();
  if (!acquired) {
    console.error('[SKIP] Another cron worker instance already holds the lock — exiting.');
    await pool.end();
    process.exit(1);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  scheduleJobs();
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
