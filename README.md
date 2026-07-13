# Apex Platform

Lead generation and conversion platform for field services.

```
Apex Platform
├── Frontend (React + Next.js)
│   ├── CallAssistant (Incoming call UI)      → app/call-assistant
│   ├── Dashboard (Analytics)                 → app/dashboard
│   └── Admin Panel                           → app/admin
├── Backend (Next.js API)
│   ├── /api/auth (Authentication)            → app/api/auth
│   ├── /api/leads (Lead lookup)               → app/api/leads
│   └── /api/booked-jobs (Booking tracking)   → app/api/booked-jobs
├── Services
│   ├── Prospect Scoring (Conversion probability)  → lib/services/prospectScoring.js
│   ├── Lead Discovery (New prospect mining)       → lib/services/leadDiscovery.js
│   └── Lead Rescue (Re-engagement sequences)      → lib/services/leadRescue.js
├── Database (PostgreSQL)
│   ├── prospects (enriched prospect data)
│   ├── leads (incoming calls)
│   └── booked_jobs (booking tracking)
└── Integrations                              → lib/integrations
    ├── Twilio (Calls + SMS)
    ├── OpenAI (SMS copy generation)
    ├── Google Places (Prospect data)
    ├── Hunter.io (Email enrichment)
    └── Stripe (Billing + commission payouts)
```

## Getting started

```bash
npm install
cp .env.example .env       # fill in credentials
psql "$DATABASE_URL" -f database/migrate.sql
npm run dev
```

## Background jobs

`scripts/cron.js` runs conversion scoring, booked-job processing/cleanup, and
the lead rescue sweep. Schedule it (cron, GitHub Actions, etc.) to run
periodically; it takes a Postgres advisory lock so concurrent runs are safe.

## Webhooks

- `POST /api/twilio/voice` — Twilio incoming call webhook, looks up caller
  context and returns TwiML.
- `POST /api/twilio/sms` — Twilio incoming SMS webhook.
- `POST /api/stripe/webhook` — Stripe event webhook (commission payout
  reversals).

All three verify the request signature against the corresponding provider
before touching the database.
