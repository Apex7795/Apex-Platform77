// lib/rateLimit.js
// Shared in-memory sliding-window rate limiter, extracted out of
// app/api/embed/lead/route.js once a second and third route needed the
// same logic (login, signup, forgot-password). Good enough for a single
// Render instance; resets on deploy/restart and doesn't share state
// across instances if this ever scales horizontally -- worth moving to
// Redis at that point, not needed yet.
const buckets = new Map();

// `bucket` namespaces the limit per route (e.g. 'login', 'signup') so
// hitting one endpoint hard doesn't burn through another's allowance.
function isRateLimited(bucket, ip, { windowMs, max }) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const timestamps = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= max) {
    buckets.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  // Opportunistic cleanup so this Map doesn't grow unbounded under
  // sustained traffic -- cheap, and only runs on the rare 1/50 request.
  if (buckets.size > 5000 && Math.random() < 0.02) {
    for (const [k, ts] of buckets) {
      if (ts.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return false;
}

function getClientIp(req) {
  // Render sits behind a proxy; x-forwarded-for's first entry is the
  // original client.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

module.exports = { isRateLimited, getClientIp };
