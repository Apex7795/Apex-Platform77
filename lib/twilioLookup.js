// lib/twilioLookup.js
// Wraps Twilio's Lookup v2 API to answer one question: is this phone number
// real? Voolt and every other lead-gen competitor accepts whatever a form
// submits at face value, which is how dead numbers and fat-fingered digits
// end up billed to the tenant as a "lead." Lookup catches that before the
// row is even written.
const twilio = require('twilio');

let client = null;
function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

// Returns { verified: true|false|null, lineType: string|null }.
// verified === null means Lookup itself couldn't be reached (network/auth
// error, or credentials not configured) -- distinct from verified === false,
// which means Twilio positively identified the number as invalid. Callers
// should treat null as "unknown, don't block on it" rather than "bad."
async function verifyPhoneNumber(rawNumber) {
  if (!rawNumber || typeof rawNumber !== 'string') {
    return { verified: false, lineType: null };
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error('twilioLookup: TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not configured, skipping verification');
    return { verified: null, lineType: null };
  }

  try {
    const result = await getClient().lookups.v2.phoneNumbers(rawNumber).fetch({ fields: 'line_type_intelligence' });

    if (!result.valid) {
      return { verified: false, lineType: null };
    }

    const lineType = result.lineTypeIntelligence?.type || null;
    return { verified: true, lineType };
  } catch (err) {
    // Twilio Lookup returns a 404-style "not found" for genuinely
    // unassigned/malformed numbers -- that's a real "invalid," not an
    // error to swallow as unknown.
    if (err.status === 404) {
      return { verified: false, lineType: null };
    }
    console.error('twilioLookup: Lookup API call failed:', err.message);
    return { verified: null, lineType: null };
  }
}

module.exports = { verifyPhoneNumber };
