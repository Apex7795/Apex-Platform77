import Link from 'next/link';

export const metadata = {
  title: 'How It Works — Apex Junk Solutions',
  description: 'The execution engine for junk removal and field-service businesses -- one pipeline, verified leads, AI pricing, and your own lead-generation engine.',
};

export default function HowItWorks() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-6 py-16">
      <div className="max-w-3xl w-full mx-auto">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800 underline">
          ← Back home
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-4 mb-4">
          Stop Losing Jobs to Chaos. This Is Apex.
        </h1>
        <p className="text-lg text-slate-600 mb-10">
          Apex isn't just another software — it's the execution engine built for junk removal and
          other field-service businesses. Stop juggling five different apps, chasing dead numbers,
          and guessing on pricing. Apex locks down your entire operation in one dashboard.
        </p>

        <Section title="1. Zero blind spots. One central pipeline.">
          Calls, texts, Facebook Messenger, and website quote requests hit one single dashboard the
          moment they come in. No more missed opportunities, no more switching screens — just one
          organized pipeline.
        </Section>

        <Section title="2. Verified leads only. Zero wasted callbacks.">
          Other lead platforms hand you fake numbers and typos that waste your time. Every website
          quote request runs through live Twilio phone verification before it ever hits your
          screen — you know instantly if it's a real mobile, landline, or VOIP number, so every
          lead you look at is worth calling.
        </Section>

        <Section title="3. Deploy your website lead machine in seconds">
          Copy. Paste. Done. Drop our "Get a Quote" widget onto your business website with one line
          of code. Every prospect who fills it out flows straight into your pipeline, fully
          verified and ready for pickup.
        </Section>

        <Section title="4. Zero leads fall through the cracks">
          Track every prospect from start to finish. Move them instantly through your pipeline as
          Contacted, Quoted, Won, or Lost, so profitable jobs stop dying in buried text threads and
          missed call logs.
        </Section>

        <Section title="5. Instant AI pricing that never guesses">
          Upload job photos and Apex's AI calculates volume, material mix, and access difficulty,
          then spits out a transparent price estimate built from real math — labor, disposal, and
          travel costs — not a black-box number you have to just trust. Your customers can do the
          same thing themselves right on your website, and get an instant estimate before they ever
          call you.
        </Section>

        <Section title="6. Your own lead-generation engine, built in">
          Every account gets its own self-service prospecting tool: tell Apex a city and an
          industry (property managers, contractors, whatever fits your business) and it searches
          real local business listings, finds contact emails where it can, and drops fresh
          prospects straight into your dashboard — a lead machine that works your territory, not
          everyone else's.
        </Section>

        <Section title="7. Bulletproof receipts & tax-ready exports">
          Log final job totals in seconds. Apex builds a running ledger of your total income,
          average job size, and gives you one-click CSV exports for effortless tax season prep — no
          more lost receipts or notebooks.
        </Section>

        <Section title="8. Run your empire from your pocket">
          Install Apex to your phone's home screen from Safari or Chrome with one tap. Your entire
          business command center goes wherever you go — instant access, zero friction, total
          control.
        </Section>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-12">
          <Link
            href="/signup"
            className="inline-flex justify-center rounded-lg bg-red-700 px-6 py-3 text-white font-semibold hover:bg-red-800 transition-colors"
          >
            Sign Up
          </Link>
          <Link
            href="/login"
            className="inline-flex justify-center rounded-lg border border-slate-300 px-6 py-3 text-slate-700 font-semibold hover:bg-white transition-colors"
          >
            Log In
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-600">{children}</p>
    </div>
  );
}
