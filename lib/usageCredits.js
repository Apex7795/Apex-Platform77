// lib/usageCredits.js
// Tracks monthly free allowances + purchased credit balances for the two
// features that cost real per-call money: AI photo quoting (OpenAI
// vision) and local lead prospecting (Google Places + Hunter.io).
// Everything else in the app is flat-rate on the subscription price;
// these two draw down a monthly free allowance, then purchased credits,
// once exhausted, instead of being unlimited on the flat $49/mo price.
//
// Allowance/pack sizes below are starting defaults, not calibrated
// against real per-call OpenAI/Google Places/Hunter.io costs yet --
// tune these once actual usage data exists.
const { runWithTenant } = require('./db');

const FREE_ALLOWANCE = {
  photo_quote: 15,
  prospecting_search: 10,
};

const CREDIT_PACK_SIZE = {
  photo_quote: 10,
  prospecting_search: 5,
};

const MS_PER_30_DAYS = 30 * 24 * 60 * 60 * 1000;

async function getOrCreateUsage(client, tenantId) {
  const { rows } = await client.query('SELECT * FROM usage_credits WHERE tenant_id = $1', [tenantId]);
  let usage = rows[0];
  if (!usage) {
    const inserted = await client.query(
      `INSERT INTO usage_credits (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
       RETURNING *`,
      [tenantId]
    );
    usage = inserted.rows[0];
  }

  // Rolling 30-day free-allowance window rather than tied to the exact
  // Stripe billing-cycle date -- works the same whether or not billing is
  // active yet (e.g. during a trial).
  const periodAge = Date.now() - new Date(usage.period_started_at).getTime();
  if (periodAge > MS_PER_30_DAYS) {
    const reset = await client.query(
      `UPDATE usage_credits
       SET photo_quotes_used_this_period = 0, prospecting_searches_used_this_period = 0,
           period_started_at = now(), updated_at = now()
       WHERE tenant_id = $1
       RETURNING *`,
      [tenantId]
    );
    usage = reset.rows[0];
  }

  return usage;
}

// --- Check whether a feature call is allowed, and consume the
// allowance/credit if so. Call this INSIDE the same runWithTenant
// transaction as the feature it's gating, before doing the expensive
// external API call -- consumes optimistically at the start of the
// attempt (same pattern as the existing rate limiters), not only on
// success, so a burst of concurrent requests can't all slip through
// before any of them get recorded.
async function checkAndConsume(client, tenantId, feature) {
  const usedCol = feature === 'photo_quote' ? 'photo_quotes_used_this_period' : 'prospecting_searches_used_this_period';
  const creditsCol = feature === 'photo_quote' ? 'photo_quote_credits' : 'prospecting_credits';
  const freeAllowance = FREE_ALLOWANCE[feature];

  const usage = await getOrCreateUsage(client, tenantId);

  if (usage[usedCol] < freeAllowance) {
    await client.query(`UPDATE usage_credits SET ${usedCol} = ${usedCol} + 1, updated_at = now() WHERE tenant_id = $1`, [tenantId]);
    return { allowed: true, usedFree: true };
  }
  if (usage[creditsCol] > 0) {
    await client.query(`UPDATE usage_credits SET ${creditsCol} = ${creditsCol} - 1, updated_at = now() WHERE tenant_id = $1`, [tenantId]);
    return { allowed: true, usedFree: false };
  }
  return { allowed: false, usedFree: false };
}

async function getUsageSummary(client, tenantId) {
  const usage = await getOrCreateUsage(client, tenantId);
  return {
    photoQuote: {
      freeAllowance: FREE_ALLOWANCE.photo_quote,
      freeUsed: usage.photo_quotes_used_this_period,
      freeRemaining: Math.max(0, FREE_ALLOWANCE.photo_quote - usage.photo_quotes_used_this_period),
      credits: usage.photo_quote_credits,
    },
    prospectingSearch: {
      freeAllowance: FREE_ALLOWANCE.prospecting_search,
      freeUsed: usage.prospecting_searches_used_this_period,
      freeRemaining: Math.max(0, FREE_ALLOWANCE.prospecting_search - usage.prospecting_searches_used_this_period),
      credits: usage.prospecting_credits,
    },
  };
}

// Called from the billing webhook (no tenant session there), so this
// opens its own tenant-scoped transaction rather than taking a client.
async function addCredits(tenantId, feature, amount) {
  const creditsCol = feature === 'photo_quote' ? 'photo_quote_credits' : 'prospecting_credits';
  await runWithTenant(tenantId, (client) =>
    client.query(
      `INSERT INTO usage_credits (tenant_id, ${creditsCol}) VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO UPDATE SET ${creditsCol} = usage_credits.${creditsCol} + $2, updated_at = now()`,
      [tenantId, amount]
    )
  );
}

module.exports = { checkAndConsume, getUsageSummary, addCredits, FREE_ALLOWANCE, CREDIT_PACK_SIZE };
