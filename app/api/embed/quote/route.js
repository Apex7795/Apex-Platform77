// app/api/embed/quote/route.js
// POST /api/embed/quote -- the photo-upload half of the embed widget
// (public/widget.js). A stranger on a tenant's own website can attach 1-3
// photos of their junk and get an instant AI price estimate, no login,
// same trust model as /api/embed/lead: tenantId comes from the request
// body (burned into that tenant's script tag), and the endpoint can only
// create rows for a tenant that already exists -- it can't read, update,
// or delete anything.
//
// This calls the vision model on every submission, so unlike the plain
// text lead form this has a real per-request dollar cost -- rate limited
// tighter than the logged-in /api/quotes/analyze equivalent, and capped
// at fewer/smaller photos.
import { pool, runWithTenant } from '../../../../lib/db';
import { verifyPhoneNumber } from '../../../../lib/twilioLookup';
import { isRateLimited, getClientIp } from '../../../../lib/rateLimit';
import { analyzeJobPhotos, calculatePricing } from '../../../../lib/quoteAnalysis';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req) {
  const ip = getClientIp(req);
  if (isRateLimited('embed_quote', ip, { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return Response.json(
      { error: 'Too many quote requests from this network -- please try again later' },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400, headers: CORS_HEADERS });
  }

  const tenantId = formData.get('tenantId');
  const name = formData.get('name');
  const phone = formData.get('phone');
  const message = formData.get('message') || null;
  const website = formData.get('website'); // honeypot

  if (website) {
    return Response.json({ ok: true, suggestedPriceCents: 0 }, { headers: CORS_HEADERS });
  }

  if (!tenantId || !name || !phone) {
    return Response.json(
      { error: 'tenantId, name, and phone are all required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (name.length > 200 || phone.length > 50 || (message && message.length > 2000)) {
    return Response.json({ error: 'One or more fields is too long' }, { status: 400, headers: CORS_HEADERS });
  }

  const photoFiles = formData.getAll('photos').filter((f) => f instanceof File);
  if (photoFiles.length === 0) {
    return Response.json({ error: 'At least one photo is required' }, { status: 400, headers: CORS_HEADERS });
  }
  if (photoFiles.length > MAX_PHOTOS) {
    return Response.json({ error: `Maximum ${MAX_PHOTOS} photos` }, { status: 400, headers: CORS_HEADERS });
  }
  for (const file of photoFiles) {
    if (file.size > MAX_PHOTO_BYTES) {
      return Response.json({ error: 'Each photo must be under 6MB' }, { status: 400, headers: CORS_HEADERS });
    }
    if (!file.type.startsWith('image/')) {
      return Response.json({ error: 'Only image files are allowed' }, { status: 400, headers: CORS_HEADERS });
    }
  }

  try {
    const { rows: tenantRows } = await pool.query('SELECT 1 FROM tenants WHERE id = $1', [tenantId]);
    if (tenantRows.length === 0) {
      return Response.json({ error: 'Unknown tenant' }, { status: 404, headers: CORS_HEADERS });
    }

    const { verified, lineType } = await verifyPhoneNumber(phone);
    if (verified === false) {
      return Response.json(
        { error: 'That phone number could not be verified -- please double-check it and try again.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const photoBase64List = await Promise.all(
      photoFiles.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        return buffer.toString('base64');
      })
    );

    const analysis = await analyzeJobPhotos(photoBase64List);
    const pricing = calculatePricing(analysis, { travelMiles: 0 });

    const result = await runWithTenant(tenantId, async (client) => {
      const { rows: leadRows } = await client.query(
        `INSERT INTO leads (tenant_id, source, caller_number, status, form_data, phone_verified, phone_line_type, phone_verification_checked_at)
         VALUES ($1, 'photo_quote_widget', $2, 'new', $3::jsonb, $4, $5, now())
         RETURNING id`,
        [tenantId, phone, JSON.stringify({ name, message }), verified, lineType]
      );
      const leadId = leadRows[0].id;

      await client.query(
        `INSERT INTO quotes (
           tenant_id, lead_id, photo_count, volume_cubic_yards, material_breakdown,
           access_difficulty, time_estimate_hours, cost_labor_cents, cost_disposal_cents,
           cost_travel_cents, suggested_price_cents, raw_analysis
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
        [
          tenantId,
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
      );

      return { leadId };
    });

    return Response.json(
      {
        ok: true,
        leadId: result.leadId,
        suggestedPriceCents: pricing.suggestedPriceCents,
        volumeCubicYards: analysis.volume_cubic_yards,
        accessDifficulty: analysis.access_difficulty,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error('Embed widget quote error:', err.message, { tenantId });
    return Response.json({ error: 'Failed to generate a quote -- please try again' }, { status: 500, headers: CORS_HEADERS });
  }
}
