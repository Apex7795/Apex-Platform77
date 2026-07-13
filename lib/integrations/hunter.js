const HUNTER_BASE_URL = 'https://api.hunter.io/v2';

async function findDomainEmails({ domain }) {
  if (!domain) {
    throw new Error('domain is required');
  }

  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error('Hunter.io API key is not configured');
  }

  const params = new URLSearchParams({ domain, api_key: apiKey });
  const response = await fetch(`${HUNTER_BASE_URL}/domain-search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Hunter.io request failed: ${response.status}`);
  }

  const data = await response.json();
  const emails = data.data?.emails || [];

  return emails.map((email) => ({
    email: email.value,
    confidence: email.confidence,
    first_name: email.first_name,
    last_name: email.last_name,
  }));
}

module.exports = { findDomainEmails };
