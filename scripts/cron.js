const { pool } = require('../lib/db');
const { updateStaleScores } = require('../lib/services/prospectScoring');
const { runRescueSweep } = require('../lib/services/leadRescue');

const LOCK_ID = 1000;
const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

async function acquireLock() {
  const result = await pool.query(
    'SELECT pg_try_advisory_lock($1) as acquired',
    [LOCK_ID]
  );
  return result.rows[0].acquired;
}

async function releaseLock() {
  await pool.query(
    'SELECT pg_advisory_unlock($1) as released',
    [LOCK_ID]
  );
}

async function updateConversionScores() {
  console.log('Updating conversion scores...');
  try {
    const count = await updateStaleScores();
    console.log(`Updated ${count} prospects`);
  } catch (error) {
    console.error('Error updating conversion scores:', error);
    throw error;
  }
}

async function rescueStaleLeads() {
  console.log('Running lead rescue sweep...');
  const tenantId = process.env.PROSPECTING_HOUSE_TENANT_ID;
  if (!tenantId) {
    console.log('[SKIP] PROSPECTING_HOUSE_TENANT_ID not configured');
    return;
  }

  try {
    const results = await runRescueSweep(tenantId);
    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    console.log(`Rescue sweep sent ${sent} messages, ${failed} failed`);
  } catch (error) {
    // Don't throw - rescue failures shouldn't block score/cleanup jobs
    console.error('Error running lead rescue sweep:', error);
  }
}

async function processBookedJobs() {
  console.log('Processing booked jobs...');
  try {
    const result = await pool.query(`
      UPDATE booked_jobs
      SET status = 'processed'
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '24 hours'
      RETURNING id
    `);
    console.log(`Processed ${result.rowCount} booked jobs`);
  } catch (error) {
    console.error('Error processing booked jobs:', error);
    throw error;
  }
}

async function cleanupOldRecords() {
  console.log('Cleaning up old records...');
  try {
    const result = await pool.query(`
      DELETE FROM booked_jobs
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `);
    console.log(`Deleted ${result.rowCount} old records`);
  } catch (error) {
    console.error('Error cleaning up records:', error);
    throw error;
  }
}

async function runScheduler() {
  const acquired = await acquireLock();
  if (!acquired) {
    console.log('[SKIP] Could not acquire lock, another instance running');
    return;
  }

  try {
    console.log('[START] Scheduler running at', new Date().toISOString());

    await updateConversionScores();
    await processBookedJobs();
    await cleanupOldRecords();
    await rescueStaleLeads();

    console.log('[SUCCESS] Scheduler completed at', new Date().toISOString());
  } catch (error) {
    console.error('[ERROR] Scheduler failed:', error);
    process.exit(1);
  } finally {
    await releaseLock();
    await pool.end();
  }
}

if (require.main === module) {
  // Set timeout to prevent hanging
  const timeout = setTimeout(() => {
    console.error('[TIMEOUT] Scheduler exceeded maximum runtime');
    process.exit(1);
  }, LOCK_TIMEOUT);

  runScheduler()
    .catch(error => {
      console.error('[FATAL]', error);
      process.exit(1);
    })
    .finally(() => clearTimeout(timeout));
}

module.exports = { runScheduler };
