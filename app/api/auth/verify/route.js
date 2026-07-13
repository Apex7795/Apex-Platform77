export async function GET(request) {
  const auth = request.headers.get('authorization');

  if (!auth || !auth.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = auth.substring(7);

  if (token !== process.env.ADMIN_API_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({ role: 'admin' });
}
