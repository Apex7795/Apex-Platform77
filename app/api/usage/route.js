// app/api/usage/route.js
// GET /api/usage -- current tenant's free-allowance usage and purchased
// credit balance for the two metered features, so the dashboard can show
// "X of Y free this month" and a buy-more button before they hit the wall.
import { runWithTenant } from '../../../lib/db';
import { getSessionFromRequest } from '../../../lib/session';
import { getUsageSummary } from '../../../lib/usageCredits';

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    const usage = await runWithTenant(session.tenantId, (client) => getUsageSummary(client, session.tenantId));
    return Response.json(usage);
  } catch (err) {
    console.error('Usage fetch error:', err.message, { tenantId: session.tenantId });
    return Response.json({ error: 'Failed to load usage' }, { status: 500 });
  }
}
