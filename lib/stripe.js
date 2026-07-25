// lib/stripe.js
// Shared Stripe client, same lazy-init pattern as lib/twilioLookup.js and
// services/prospectOutreach.js's Postmark client -- avoids constructing it
// at module load time (and throwing on missing env vars) for routes that
// import this file but don't happen to call Stripe on a given request.
const Stripe = require('stripe');

let _stripe;
function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

module.exports = { getStripe };
