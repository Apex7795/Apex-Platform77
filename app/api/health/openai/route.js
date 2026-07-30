// app/api/health/openai/route.js
// GET /api/health/openai -- makes one real, minimal OpenAI request to
// find out exactly why photo quotes are failing (invalid key vs no
// billing/credits vs something else) instead of guessing from the
// generic "not configured" message shown to end users. Costs a
// fraction of a cent per check. Never returns the key itself.
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ set: false, error: 'OPENAI_API_KEY is not set' });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'reply with the single word OK' }],
        max_tokens: 5,
      }),
    });
    const body = await res.json();
    return Response.json({
      set: true,
      httpStatus: res.status,
      ok: res.ok,
      // Only the error type/message, never any part of the key.
      errorType: body.error?.type || null,
      errorMessage: body.error?.message || null,
    });
  } catch (err) {
    return Response.json({ set: true, error: err.message });
  }
}
