import { safeCompare } from '@/lib/auth';

export async function POST(request) {
  const { username, password } = await request.json();

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword || !process.env.ADMIN_API_TOKEN) {
    return Response.json({ error: 'Admin login is not configured' }, { status: 503 });
  }

  const validUsername = safeCompare(username, expectedUsername);
  const validPassword = safeCompare(password, expectedPassword);

  if (!validUsername || !validPassword) {
    return Response.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  return Response.json({ token: process.env.ADMIN_API_TOKEN, role: 'admin' });
}
