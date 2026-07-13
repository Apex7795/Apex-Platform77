const { pool } = require('../db');

function computeScore({ review_count, rating }) {
  const reviewScore = review_count > 50 ? 60 : review_count > 20 ? 50 : 30;
  const ratingScore = rating >= 4.5 ? 25 : rating >= 4.0 ? 15 : 0;
  const score = reviewScore + ratingScore;
  const probability = Math.min((score / 100) * 95, 95);
  return { score, probability };
}

async function scoreProspect(prospectId) {
  const { rows } = await pool.query(
    `SELECT id, review_count, rating, last_scored_at, last_score_review_count
     FROM prospects WHERE id = $1`,
    [prospectId]
  );

  if (rows.length === 0) {
    throw new Error('Prospect not found');
  }

  const prospect = rows[0];
  const { score, probability } = computeScore(prospect);

  const daysSinceLastScore = prospect.last_scored_at
    ? (Date.now() - new Date(prospect.last_scored_at).getTime()) / 86400000
    : null;
  const reviewVelocity = daysSinceLastScore
    ? (prospect.review_count - (prospect.last_score_review_count || 0)) / daysSinceLastScore
    : 0;

  const { rows: updated } = await pool.query(
    `UPDATE prospects
     SET conversion_score = $2,
         conversion_probability = $3,
         review_velocity = $4,
         last_scored_at = now(),
         last_score_review_count = review_count
     WHERE id = $1
     RETURNING id, conversion_score, conversion_probability, review_velocity`,
    [prospectId, score, probability, reviewVelocity]
  );

  return updated[0];
}

// Bulk version of scoreProspect() used by the cron scheduler - recomputes every
// prospect that hasn't been scored in the last 24 hours in a single statement.
async function updateStaleScores() {
  const result = await pool.query(`
    UPDATE prospects
    SET
      conversion_score = CASE
        WHEN review_count > 50 THEN 60
        WHEN review_count > 20 THEN 50
        ELSE 30
      END +
      CASE
        WHEN rating >= 4.5 THEN 25
        WHEN rating >= 4.0 THEN 15
        ELSE 0
      END,
      conversion_probability = LEAST((
        (CASE
          WHEN review_count > 50 THEN 60
          WHEN review_count > 20 THEN 50
          ELSE 30
        END +
        CASE
          WHEN rating >= 4.5 THEN 25
          WHEN rating >= 4.0 THEN 15
          ELSE 0
        END) / 100.0) * 95, 95),
      review_velocity = (review_count - COALESCE(last_score_review_count, 0)) / NULLIF(EXTRACT(DAY FROM (NOW() - last_scored_at)), 0),
      last_score_review_count = review_count,
      last_scored_at = now()
    WHERE last_scored_at IS NULL OR last_scored_at < NOW() - INTERVAL '24 hours'
    RETURNING id
  `);

  return result.rowCount;
}

module.exports = { computeScore, scoreProspect, updateStaleScores };
