// lib/session.js
// Password hashing + signed session cookies for tenant user login.
//
// Uses only Node's built-in crypto (scrypt for passwords, HMAC for the
// session token) -- same approach lib/actionTokens.js already uses for
// magic links, so no new npm dependency (bcrypt/jsonwebtoken) is needed.
const crypto = require('crypto');

const SESSION_SECRET = process.env.ACTION_TOKEN_SECRET; // reuse the existing signing secret
const SESSION_COOKIE = 'apex_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

// --- Password hashing ---
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hash] = storedHash.split(':');
  const candidateHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  const candidateBuffer = Buffer.from(candidateHash, 'hex');
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}

// --- Password reset tokens (same signed-payload pattern as actionTokens.js,
// short-lived and single-purpose so a leaked/old link can't be replayed
// forever or reused for anything other than resetting that one user's
// password) ---
const RESET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

function generatePasswordResetToken({ userId, tenantId }) {
  if (!SESSION_SECRET) throw new Error('ACTION_TOKEN_SECRET is not set');
  const payload = {
    userId,
    tenantId,
    purpose: 'password_reset',
    exp: Math.floor(Date.now() / 1000) + RESET_TOKEN_TTL_SECONDS,
  };
  const payloadStr = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${signature}`;
}

function verifyPasswordResetToken(token) {
  if (!SESSION_SECRET) throw new Error('ACTION_TOKEN_SECRET is not set');
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;

  const [payloadStr, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString());
  } catch {
    return null;
  }

  if (payload.purpose !== 'password_reset') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expired
  return payload;
}

// --- Session tokens (same signed-payload pattern as actionTokens.js) ---
function createSessionToken({ userId, tenantId, role }) {
  if (!SESSION_SECRET) throw new Error('ACTION_TOKEN_SECRET is not set');
  const payload = {
    userId,
    tenantId,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadStr = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${signature}`;
}

function verifySessionToken(token) {
  if (!SESSION_SECRET) throw new Error('ACTION_TOKEN_SECRET is not set');
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;

  const [payloadStr, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString());
  } catch {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expired
  return payload;
}

// --- Cookie helpers for Next.js Response/Request objects ---
function sessionCookieHeader(token) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getSessionFromRequest(req) {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  return verifySessionToken(match[1]);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  sessionCookieHeader,
  clearSessionCookieHeader,
  getSessionFromRequest,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  SESSION_COOKIE,
};
