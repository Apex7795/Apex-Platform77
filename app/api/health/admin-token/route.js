// app/api/health/admin-token/route.js
// GET /api/health/admin-token -- diagnose "Unauthorized -- missing or
// incorrect token" on /api/admin/promote and /api/admin/rotate-app-user-password
// by showing a safe fingerprint (length + first/last 4 characters) of
// the ADMIN_API_TOKEN actually stored on this deployment, instead of
// the full secret. Enough to tell "wrong value," "extra whitespace," or
// "not deployed yet" apart from each other without exposing the token.

// Without this, Next.js can statically prerender this route at BUILD
// time (it has no dynamic inputs -- no cookies/headers/params) and then
// serve that same frozen snapshot forever, ignoring any later change to
// the actual env var. Exactly the bug that made this diagnostic keep
// reporting "not set" even after the real value was fixed and redeployed.
export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.ADMIN_API_TOKEN || '';
  const trimmed = token.trim();
  return Response.json({
    set: Boolean(token),
    length: token.length,
    startsWith: token.slice(0, 4),
    endsWith: token.slice(-4),
    hasWhitespace: /\s/.test(token),
    // The routes that check this token now trim() before comparing, so
    // this is what actually determines auth success, regardless of
    // whatever stray whitespace Render's Environment tab captured.
    trimmedLength: trimmed.length,
  });
}
