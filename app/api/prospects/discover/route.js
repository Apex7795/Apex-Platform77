import { isAuthorized } from '@/lib/auth';
import { discoverProspects } from '@/lib/services/leadDiscovery';

export async function POST(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { query, location } = await request.json();
  if (!query) {
    return Response.json({ error: 'query is required' }, { status: 400 });
  }

  const tenantId = process.env.PROSPECTING_HOUSE_TENANT_ID;
  if (!tenantId) {
    return Response.json({ error: 'PROSPECTING_HOUSE_TENANT_ID is not configured' }, { status: 503 });
  }

  try {
    const result = await discoverProspects({ tenantId, query, location });
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error('Prospect discovery error:', error);
    return Response.json({ error: error.message }, { status: 502 });
  }
}
