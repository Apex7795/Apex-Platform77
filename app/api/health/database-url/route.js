// app/api/health/database-url/route.js
// GET /api/health/database-url -- a safe fingerprint of DATABASE_URL,
// same reasoning as /api/health/admin-token: a screenshot of the raw
// value in Render's Environment tab has repeatedly missed corruption
// (stray whitespace, dropped characters from mobile copy-paste) that's
// invisible to the eye but breaks the connection. This never returns
// the password -- only the part of the URL after the last '@', which is
// host/port/database name, not a secret, plus length/whitespace info
// about the full value.
export const dynamic = 'force-dynamic';

export async function GET() {
  const raw = process.env.DATABASE_URL || '';
  const trimmed = raw.trim();
  const atIndex = raw.lastIndexOf('@');

  return Response.json({
    set: Boolean(raw),
    length: raw.length,
    trimmedLength: trimmed.length,
    hasWhitespace: /\s/.test(raw),
    startsWithScheme: raw.startsWith('postgresql://') || raw.startsWith('postgres://'),
    // Everything after the last '@' -- host, port, database name. Never
    // includes the password (which sits before '@'), safe to show.
    hostPortDb: atIndex === -1 ? null : raw.slice(atIndex + 1),
    // Username only (between scheme and ':'), also not a secret.
    username: raw.includes('://') && raw.includes(':', raw.indexOf('://') + 3)
      ? raw.slice(raw.indexOf('://') + 3, raw.indexOf(':', raw.indexOf('://') + 3))
      : null,
  });
}
