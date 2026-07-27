// app/api/quotes/analyze/route.js
// POST /api/quotes/analyze -- upload 1-5 job photos, get back an AI volume/
// material/difficulty estimate plus a suggested price. Requires a real
// tenant session (this is an operator tool, not public) -- the exact gap
// the earlier pasted version of this feature left wide open.
import { runWithTenant } from '../../../../lib/db';
import { getSessionFromRequest } from '../../../../lib/session';
import { analyzeJobPhotos, calculatePricing } from '../../../../lib/quoteAnalysis';
import { isRateLimited, getClientIp } from '../../../../lib/rateLimit';
import { checkAndConsume } from '../../../../lib/usageCredits';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB/photo -- generous for a phone camera shot, not unbounded
// Vision API calls cost real money per request -- rate-limited same as
// every other write endpoint in this app, tighter since each call has a
// real per-request cost.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: 'Not logged in' }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (isRateLimited('quotes_analyze', `${ip}:${session.tenantId}`, { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return Response.json({ error: 'Too many quote requests -- please wait a few minutes and try again' }, { status: 429 });
  }

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const photoFiles = formData.getAll('photos').filter((f) => f instanceof File);
  const leadId = formData.get('leadId') || null;
  const travelMiles = Number(formData.get('travelMiles')) || 0;

  if (photoFiles.length === 0) {
    return Response.json({ error: 'At least one photo is required' }, { status: 400 });
  }
  if (photoFiles.length > MAX_PHOTOS) {
    return Response.json({ error: `Maximum ${MAX_PHOTOS} photos per quote` }, { status: 400 });
  }
  for (const file of photoFiles) {
    if (file.size > MAX_PHOTO_BYTES) {
      return Response.json({ error: 'Each photo must be under 8MB' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return Response.json({ error: 'Only image files are allowed' }, { status: 400 });
    }
  }

  try {
    // Check the monthly free allowance / purchased credits BEFORE paying
    // for the vision API call -- no point spending real money on a
    // request we're about to reject anyway.
    const usageResult = await runWithTenant(session.tenantId, (client) =>
      checkAndConsume(client, session.tenantId, 'photo_quote')
    );
    if (!usageResult.allowed) {
      return Response.json(
        { error: 'Monthly free photo quotes used up -- buy more to keep going this period.', usageExceeded: true, feature: 'photo_quote' },
        { status: 402 }
      );
    }

    const photoBase64List = await Promise.all(
      photoFiles.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        return buffer.toString('base64');
      })
    );

    const analysis = await analyzeJobPhotos(photoBase64List);
    const pricing = calculatePricing(analysis, { travelMiles });

    const { rows } = await runWithTenant(session.tenantId, (client) =>
      client.query(
        `INSERT INTO quotes (
           tenant_id, lead_id, photo_count, volume_cubic_yards, material_breakdown,
           access_difficulty, time_estimate_hours, cost_labor_cents, cost_disposal_cents,
           cost_travel_cents, suggested_price_cents, raw_analysis
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12::jsonb)
         RETURNING id, created_at`,
        [
          session.tenantId,
          leadId,
          photoFiles.length,
          analysis.volume_cubic_yards,
          JSON.stringify(analysis.material_breakdown),
          analysis.access_difficulty,
          analysis.time_estimate_hours,
          pricing.costLaborCents,
          pricing.costDisposalCents,
          pricing.costTravelCents,
          pricing.suggestedPriceCents,
          JSON.stringify(analysis),
        ]
      )
    );

    return Response.json({
      id: rows[0].id,
      createdAt: rows[0].created_at,
      analysis,
      pricing,
    });
  } catch (err) {
    console.error('Quote analysis error:', err.message, { tenantId: session.tenantId });
    // Distinguish "this feature isn't set up yet" (OpenAI key missing, or
    // present but unfunded/invalid -- OpenAI's SDK throws a 401/429-style
    // error in that case too) from an actual bug, so this doesn't read as
    // "something's broken with your photos" when the real cause is the
    // platform's own OpenAI account not being configured/funded.
    const notConfigured =
      err.message.includes('OPENAI_API_KEY') ||
      err.status === 401 ||
      err.status === 429 ||
      /quota|billing/i.test(err.message);
    if (notConfigured) {
      return Response.json(
        { error: 'AI photo pricing isn’t turned on for this account yet -- this is a setup issue on our end, not with your photos. Try again shortly.' },
        { status: 503 }
      );
    }
    return Response.json({ error: 'Failed to analyze photos -- please try again' }, { status: 500 });
  }
}
