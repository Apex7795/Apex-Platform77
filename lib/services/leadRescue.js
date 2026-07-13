const { pool } = require('../db');
const { generateRescueSms } = require('../integrations/openai');
const { sendSms } = require('../integrations/twilio');

const STALE_HOURS = 72;
const MAX_LOOKBACK_DAYS = 14;

// Leads that went quiet (no update in STALE_HOURS) but aren't ancient and
// haven't converted to a booked job yet are candidates for re-engagement.
async function findRescueCandidates(tenantId) {
  const { rows } = await pool.query(
    `SELECT l.id AS lead_id, l.phone, l.prospect_id, p.name AS prospect_name
     FROM leads l
     LEFT JOIN prospects p ON p.id = l.prospect_id
     LEFT JOIN booked_jobs b ON b.lead_id = l.id
     WHERE l.tenant_id = $1
       AND l.status = 'active'
       AND l.phone IS NOT NULL
       AND b.id IS NULL
       AND l.updated_at < NOW() - ($2 || ' hours')::interval
       AND l.updated_at > NOW() - ($3 || ' days')::interval`,
    [tenantId, STALE_HOURS, MAX_LOOKBACK_DAYS]
  );
  return rows;
}

async function rescueLead({ leadId }) {
  const { rows } = await pool.query(
    `SELECT l.id AS lead_id, l.phone, l.prospect_id, p.name AS prospect_name
     FROM leads l
     LEFT JOIN prospects p ON p.id = l.prospect_id
     WHERE l.id = $1`,
    [leadId]
  );

  if (rows.length === 0) {
    throw new Error('Lead not found');
  }

  const lead = rows[0];
  if (!lead.phone) {
    throw new Error('Lead has no phone number on file');
  }

  const message = await generateRescueSms({ prospectName: lead.prospect_name });
  await sendSms({ to: lead.phone, body: message });

  await pool.query(
    `UPDATE leads SET status = 'rescue_sent', updated_at = now() WHERE id = $1`,
    [leadId]
  );

  return { leadId, message };
}

async function runRescueSweep(tenantId) {
  const candidates = await findRescueCandidates(tenantId);
  const results = [];

  for (const candidate of candidates) {
    try {
      const result = await rescueLead({ leadId: candidate.lead_id });
      results.push({ ...result, ok: true });
    } catch (error) {
      results.push({ leadId: candidate.lead_id, ok: false, error: error.message });
    }
  }

  return results;
}

module.exports = { findRescueCandidates, rescueLead, runRescueSweep };
