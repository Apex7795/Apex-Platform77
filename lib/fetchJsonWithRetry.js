// lib/fetchJsonWithRetry.js
// Client-side helper: retries a POST-JSON request exactly once, but only
// when the *network request itself* fails (dropped connection -- e.g. a
// Render deploy restarting mid-request) -- never when the server responds
// with a real error like "invalid password" or "email already exists".
//
// This exists because three different people hit the same confusing
// failure today: signup's connection dropped, the browser showed
// "Something went wrong," but the account had already been created
// server-side (writes here are atomic, so a retry either finds that same
// result already committed, or completes it -- never a half-created
// account). A silent one-time retry closes that gap for the common case
// (a blip during a deploy) without ever risking a duplicate write, since
// the server enforces uniqueness/idempotency on its own end regardless.
export async function postJsonWithRetry(url, body) {
  try {
    return await postJsonOnce(url, body);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return await postJsonOnce(url, body);
  }
}

async function postJsonOnce(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}
