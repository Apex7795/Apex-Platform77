const Stripe = require('stripe');

function getClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Stripe secret key is not configured');
  }
  return new Stripe(secretKey);
}

async function payoutCommission({ amount, currency = 'usd', destinationAccountId, description }) {
  if (!amount || amount <= 0) {
    throw new Error('amount must be a positive number');
  }
  if (!destinationAccountId) {
    throw new Error('destinationAccountId is required');
  }

  const client = getClient();
  return client.transfers.create({
    amount: Math.round(amount * 100),
    currency,
    destination: destinationAccountId,
    description,
  });
}

module.exports = { getClient, payoutCommission };
