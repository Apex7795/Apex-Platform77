const OpenAI = require('openai');

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({ apiKey });
}

async function generateRescueSms({ prospectName, jobType }) {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You write short, friendly SMS messages (under 320 characters) that re-engage a ' +
          'prospect who requested a quote but never booked. No emojis, no links, no pressure tactics.',
      },
      {
        role: 'user',
        content: `Prospect name: ${prospectName || 'there'}. Job type: ${jobType || 'a service'}. Write one re-engagement SMS.`,
      },
    ],
    max_tokens: 120,
  });

  const message = completion.choices[0]?.message?.content?.trim();
  if (!message) {
    throw new Error('OpenAI returned an empty response');
  }
  return message;
}

module.exports = { getClient, generateRescueSms };
