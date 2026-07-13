import { isAuthorized } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';
import { scoreProspect } from '@/lib/services/prospectScoring';

export async function POST(request, { params }) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return Response.json({ error: 'Invalid prospect id' }, { status: 400 });
  }

  try {
    const result = await scoreProspect(id);
    return Response.json(result);
  } catch (error) {
    console.error('Prospect scoring error:', error);
    const status = error.message === 'Prospect not found' ? 404 : 400;
    return Response.json({ error: error.message }, { status });
  }
}
