const { timingSafeEqual } = require('crypto');

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(request) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;

  const token = auth.substring(7);
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return false;

  return safeCompare(token, expected);
}

module.exports = { safeCompare, isAuthorized };
