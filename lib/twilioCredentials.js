// lib/twilioCredentials.js
// Centralizes reading TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN so every call
// site trims the same way -- Render's mobile Environment editor has
// repeatedly saved a stray leading/trailing space or newline around a
// pasted value (see lib/adminAuth.js, lib/db.js for the same fix on
// ADMIN_API_TOKEN/DATABASE_URL). An untrimmed Twilio Auth Token breaks
// two different things silently: real REST API calls fail Twilio's own
// auth check (error 20003, message "Authenticate"), and
// twilio.validateRequest's HMAC signature check never matches, so every
// genuine inbound call/SMS webhook gets rejected as "Invalid signature"
// with no other symptom.
function getTwilioAccountSid() {
  return (process.env.TWILIO_ACCOUNT_SID || '').trim();
}

function getTwilioAuthToken() {
  return (process.env.TWILIO_AUTH_TOKEN || '').trim();
}

module.exports = { getTwilioAccountSid, getTwilioAuthToken };
