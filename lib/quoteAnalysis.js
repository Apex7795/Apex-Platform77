// lib/quoteAnalysis.js
// AI photo-based job estimation: given 1-5 photos of a job site, estimates
// volume/materials/access difficulty via GPT-4o vision, then derives a
// suggested price from simple, transparent cost math -- no fabricated
// "booking probability" or invented market-comparison numbers presented
// as real data, since there's no actual data behind those. Just an
// estimate the operator can adjust with their own judgment.
const OpenAI = require('openai');

let _openai;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const SYSTEM_PROMPT = `You are a junk removal estimator looking at photos of a job site.
Respond ONLY with valid JSON matching this exact schema, no markdown fences, no preamble:
{
  "volume_cubic_yards": number (0.5-40, a single truck load is roughly 10-15 cubic yards),
  "material_breakdown": { "<material>": number }, // percentages, must sum to 100
  "access_difficulty": "easy" | "medium" | "hard" | "very_hard",
  "time_estimate_hours": number (0.5-8, for a 2-person crew),
  "notes": string (under 100 chars, anything unusual worth flagging)
}
Base every number only on what's visible in the photos. Do not guess at
things you can't see (e.g. what's inside closed boxes/bags). If photos
show conflicting or unclear information, estimate conservatively.`;

async function analyzeJobPhotos(photoBase64List) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  if (!photoBase64List || photoBase64List.length === 0) {
    throw new Error('At least one photo is required');
  }

  const imageContent = photoBase64List.map((base64) => ({
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${base64}` },
  }));

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [{ type: 'text', text: `Analyze these ${photoBase64List.length} photo(s) of a junk removal job.` }, ...imageContent],
      },
    ],
    temperature: 0.3,
    max_tokens: 400,
  });

  const analysis = JSON.parse(completion.choices[0].message.content);

  const requiredKeys = ['volume_cubic_yards', 'material_breakdown', 'access_difficulty', 'time_estimate_hours'];
  for (const key of requiredKeys) {
    if (analysis[key] === undefined) throw new Error(`AI response missing required field: ${key}`);
  }

  return analysis;
}

// --- Cost math, deliberately simple and inspectable ---
// Every number here is a plain, explainable calculation an operator could
// redo by hand -- not a black-box "AI pricing algorithm."
const DEFAULT_LABOR_RATE_CENTS_PER_HOUR = 5000; // $50/hr for a 2-person crew, adjust per your actual costs
const DEFAULT_DISPOSAL_RATE_CENTS_PER_YARD = 3000; // $30/yd3, roughly average US dump fee
const DEFAULT_PRICE_PER_YARD_CENTS = 6500; // $65/yd3, common junk-removal retail rate
const ACCESS_MULTIPLIER = { easy: 1.0, medium: 1.1, hard: 1.2, very_hard: 1.35 };

function calculatePricing(analysis, { travelMiles = 0 } = {}) {
  const laborCents = Math.round(analysis.time_estimate_hours * DEFAULT_LABOR_RATE_CENTS_PER_HOUR);
  const disposalCents = Math.round(analysis.volume_cubic_yards * DEFAULT_DISPOSAL_RATE_CENTS_PER_YARD);
  // Simple flat per-mile estimate (fuel + vehicle wear), round trip.
  const travelCents = Math.round(travelMiles * 2 * 150);

  const multiplier = ACCESS_MULTIPLIER[analysis.access_difficulty] || 1.1;
  const suggestedPriceCents = Math.round(analysis.volume_cubic_yards * DEFAULT_PRICE_PER_YARD_CENTS * multiplier);

  return {
    costLaborCents: laborCents,
    costDisposalCents: disposalCents,
    costTravelCents: travelCents,
    suggestedPriceCents,
  };
}

module.exports = { analyzeJobPhotos, calculatePricing };
