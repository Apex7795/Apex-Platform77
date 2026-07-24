// app/api/leads/[id]/recording/route.js
// GET /api/leads/:id/recording -> proxies the Twilio call recording audio.
//
// Scoped to whichever tenant the logged-in user's session belongs to.
import { runWithTenant } from '../../../../../lib/db';
import { getSessionFromRequest } from '../../../../../lib/session';

export async function GET(req, { params }) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }
  const tenantId = session.tenantId;

  const { id } = params;

  try {
    // RLS confirms this tenant actually owns this lead before we proxy anything
    const lead = await runWithTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT recording_url FROM leads WHERE id = $1`,
        [id]
      );
      return rows[0];
    });

    if (!lead || !lead.recording_url) {
      return Response.json({ error: 'Recording not found' }, { status: 404 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s upstream timeout

    let twilioRes;
    try {
      twilioRes = await fetch(lead.recording_url, {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!twilioRes.ok) {
      console.error('Twilio recording fetch failed', { status: twilioRes.status, leadId: id });
      return Response.json({ error: 'Could not retrieve recording' }, { status: 502 });
    }

    const headers = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=3600' };
    if (twilioRes.headers.has('content-length')) {
      headers['Content-Length'] = twilioRes.headers.get('content-length');
    }

    return new Response(twilioRes.body, { status: 200, headers });
  } catch (err) {
    console.error('Recording proxy error:', err.message, { tenantId, leadId: id });
    return Response.json({ error: 'Failed to load recording' }, { status: 500 });
  }
}
