import { isAuthorized } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';
import { rescueLead } from '@/lib/services/leadRescue';

export async function POST(request, { params }) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return Response.json({ error: 'Invalid lead id' }, { status: 400 });
  }

  try {
    const result = await rescueLead({ leadId: id });
    return Response.json(result);
  } catch (error) {
    console.error('Lead rescue error:', error);
    const status = error.message === 'Lead not found' ? 404 : 400;
    return Response.json({ error: error.message }, { status });
  }
}
