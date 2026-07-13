import { isAuthorized } from '@/lib/auth';

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({ role: 'admin' });
}
