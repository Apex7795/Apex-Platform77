// app/api/auth/forgot-password/route.js
// POST /api/auth/forgot-password -- self-serve password reset, the gap
// that's caused real support headaches: a "something went wrong" network
// blip on signup can mask a signup that actually succeeded, leaving
// someone locked out of an account they don't know exists yet with no
// way back in except an operator manually running scripts/reset-password.js.
import postmark from 'postmark';
import { pool } from '../../../../lib/db';
import { generatePasswordResetToken } from '../../../../lib/session';

let _postmarkClient;
function getPostmarkClient() {
  if (!_postmarkClient) _postmarkClient = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);
  return _postmarkClient;
}

// Always returns the same generic response whether or not the email
// exists -- telling a caller "no account with that email" would let
// anyone probe which emails are registered.
const GENERIC_RESPONSE = { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email } = body || {};
  if (!email) {
    return Response.json({ error: 'email is required' }, { status: 400 });
  }

  try {
    // Same SECURITY DEFINER lookup login uses -- pre-tenant-context, and
    // users is under RLS app_user can't otherwise read across tenants.
    const { rows } = await pool.query('SELECT * FROM get_user_for_login($1)', [email]);
    const user = rows[0];

    // Deliberately still return GENERIC_RESPONSE here, and skip sending
    // anything -- an unknown email should look identical to a known one.
    if (!user) {
      return Response.json(GENERIC_RESPONSE);
    }

    if (!process.env.POSTMARK_SERVER_TOKEN || !process.env.OUTREACH_FROM_EMAIL || !process.env.APP_URL) {
      console.error('forgot-password: POSTMARK_SERVER_TOKEN/OUTREACH_FROM_EMAIL/APP_URL not configured');
      // Still return the generic response -- don't leak config state to
      // the caller -- but this is a real operational gap worth fixing.
      return Response.json(GENERIC_RESPONSE);
    }

    const token = generatePasswordResetToken({ userId: user.id, tenantId: user.tenant_id });
    const resetLink = `${process.env.APP_URL}/reset-password?token=${token}`;

    await getPostmarkClient().sendEmail({
      From: process.env.OUTREACH_FROM_EMAIL,
      To: email,
      Subject: 'Reset your Apex password',
      TextBody:
        `Click this link to set a new password. It expires in 1 hour and only works once:\n\n${resetLink}\n\n` +
        `If you didn't request this, you can ignore this email.`,
      MessageStream: 'outbound',
    });

    return Response.json(GENERIC_RESPONSE);
  } catch (err) {
    console.error('Forgot-password error:', err.message);
    // Fail generically here too -- an internal error shouldn't confirm or
    // deny account existence any more than the happy path does.
    return Response.json(GENERIC_RESPONSE);
  }
}
