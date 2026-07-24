import Link from 'next/link';

export const metadata = {
  title: 'How It Works — Apex Junk Solutions',
  description: 'What Apex does, how leads get verified, and how it works for your business.',
};

export default function HowItWorks() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-6 py-16">
      <div className="max-w-3xl w-full mx-auto">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800 underline">
          ← Back home
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-4 mb-4">
          What Apex actually does
        </h1>
        <p className="text-lg text-slate-600 mb-10">
          Apex is a lead platform for junk removal and other field-service businesses. We capture
          every way a customer can reach you — phone calls, texts, Facebook Messenger, and your
          own website — and put them in one dashboard, so you spend your time on real jobs instead
          of chasing dead numbers.
        </p>

        <Section title="1. You get one dashboard for every lead source">
          A tracking phone number that records and logs every call, inbound texts, Facebook
          Messenger messages, and quote requests from your own website all land in the same lead
          pipeline — no more checking five different places to see who's trying to reach you.
        </Section>

        <Section title="2. We verify the phone number before it counts as a lead">
          This is the part most lead platforms skip. Every quote request submitted through your
          embedded website widget gets checked against Twilio's phone verification service before
          it's saved — confirming the number is real, active, and reachable, and telling you
          whether it's a mobile, landline, or VOIP number. Fake numbers, typos, and dead leads get
          caught before they ever show up in your pipeline, so the leads you see are ones worth
          calling back.
        </Section>

        <Section title="3. You get your own copy-paste widget for your website">
          Every account gets a "Get a Quote" button and form that pastes onto your own business
          website with one line of code — quote requests submitted there flow straight into your
          Apex dashboard, verified the same way.
        </Section>

        <Section title="4. You can track every lead through to won or lost">
          Mark leads as contacted, quoted, won, or lost as you work them, right from the dashboard.
          Nothing falls through the cracks because it's buried in a text thread or a missed call
          log.
        </Section>

        <Section title="5. Install it like an app">
          Add the dashboard to your phone's home screen (from Safari or Chrome, "Add to Home
          Screen") and it opens like a normal app — no App Store required.
        </Section>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-12">
          <Link
            href="/signup"
            className="inline-flex justify-center rounded-lg bg-slate-900 px-6 py-3 text-white font-semibold hover:bg-slate-700 transition-colors"
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
