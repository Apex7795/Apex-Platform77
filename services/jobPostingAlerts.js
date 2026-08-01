// services/jobPostingAlerts.js
// Texts every other active tenant when a new job goes up on the
// marketplace board, so claiming a job doesn't depend on someone happening
// to check the dashboard. This is a transactional notification to your own
// existing, signed-up customers (same consent basis dailyDigest.js already
// relies on for its daily SMS) -- not cold outreach to strangers, so it
// doesn't carry the TCPA exposure that unsolicited marketing texts do.
//
// Broadcasts to every OTHER active tenant regardless of city/trade on
// purpose: the marketplace is explicitly designed for cross-city, even
// cross-trade claiming (see db/migrate_job_marketplace.sql's header) --
// there's no reliable structured location/trade match to filter on since
// tenants.service_area is free text, and narrowing it would work against
// the whole point of the board.
const { pool } = require('../lib/db');
const { getTwilioAccountSid, getTwilioAuthToken } = require('../lib/twilioCredentials');

let _twilioClient;
function getClient() {
  if (!_twilioClient) _twilioClient = require('twilio')(getTwilioAccountSid(), getTwilioAuthToken());
  return _twilioClient;
}

async function alertTenantsOfNewJobPosting(jobPosting, postingTenantId) {
  if (!getTwilioAccountSid() || !getTwilioAuthToken() || !process.env.PLATFORM_NOTIFICATION_NUMBER) {
    console.error('Job posting alert skipped -- Twilio/PLATFORM_NOTIFICATION_NUMBER not configured');
    return { skipped: true };
  }
  if (!process.env.APP_URL) {
    console.error('Job posting alert skipped -- APP_URL not configured');
    return { skipped: true };
  }

  const { rows: tenants } = await pool.query(
    `SELECT id, owner_phone, business_name FROM tenants
     WHERE subscription_status = 'active' AND id != $1`,
    [postingTenantId]
  );

  const body =
    `New job on Apex Marketplace: "${jobPosting.title}" in ${jobPosting.city}, ${jobPosting.state} ` +
    `(${jobPosting.commission_percent}% to the poster). Job ${jobPosting.job_tag}. ` +
    `Claim it: ${process.env.APP_URL}/job-postings`;

  let sent = 0;
  for (const tenant of tenants) {
    try {
      await getClient().messages.create({
        body,
        to: tenant.owner_phone,
        from: process.env.PLATFORM_NOTIFICATION_NUMBER,
      });
      sent += 1;
    } catch (err) {
      // One bad number/tenant shouldn't stop the rest of the broadcast
      console.error('Job posting alert failed for tenant', tenant.id, err.message);
    }
  }

  console.log(`Job posting alert for ${jobPosting.job_tag}: sent to ${sent}/${tenants.length} tenants`);
  return { attempted: tenants.length, sent };
}

module.exports = { alertTenantsOfNewJobPosting };
