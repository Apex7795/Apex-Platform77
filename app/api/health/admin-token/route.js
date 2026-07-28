// app/api/health/admin-token/route.js
// GET /api/health/admin-token -- diagnose "Unauthorized -- missing or
// incorrect token" on /api/admin/promote and /api/admin/rotate-app-user-password
// by showing a safe fingerprint (length + first/last 4 characters) of
// the ADMIN_API_TOKEN actually stored on this deployment, instead of
// the full secret. Enough to tell "wrong value," "extra whitespace," or
// "not deployed yet" apart from each other without exposing the token.
export async function GET() {
  const token = process.env.ADMIN_API_TOKEN || '';
  return Response.json({
    set: Boolean(token),
    length: token.length,
    startsWith: token.slice(0, 4),
    endsWith: token.slice(-4),
    hasWhitespace: /\s/.test(token),
  });
}
