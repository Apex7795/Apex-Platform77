import Link from 'next/link';

export const metadata = {
  title: 'Stop Losing Jobs to Voicemail — Apex Junk Solutions',
  description: 'Every call, text, and message tracked and verified in one dashboard. Built for junk removal, HVAC, and plumbing businesses.',
};

// Dedicated ad-landing page -- deliberately separate from the general
// homepage (app/page.js). Ad traffic converts better landing on one focused
// page built around a single action, not a page with nav links out to
// How It Works, Login, etc. that give a paid click somewhere else to go.
export default function GetLeads() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-2xl w-full text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-red-700 text-white text-xs font-semibold px-3 py-1 mb-6">
          APEX JUNK SOLUTIONS
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4">
          Stop losing jobs to a missed call
        </h1>
        <p className="text-lg text-slate-600 mb-10">
          Every call, text, Facebook message, and website quote request — tracked, verified, and
          in one dashboard automatically. No more digging through three apps to find out who
          tried to reach you.
        </p>

        <Link
          href="/signup"
          className="inline-flex justify-center rounded-lg bg-red-700 px-8 py-4 text-white text-lg font-semibold hover:bg-red-800 transition-colors mb-14"
        >
          Get Started Free
        </Link>

        <div className="grid sm:grid-cols-3 gap-4 text-left">
          <Feature
            title="Never Miss a Lead"
            body="Missed calls get an automatic follow-up text within minutes, so a busy day doesn't cost you a job."
          />
          <Feature
            title="Verified, Not Guessed"
            body="Phone numbers are checked before they count as a lead, so you're not wasting callbacks on fake numbers."
          />
          <Feature
            title="One Dashboard, Every Channel"
            body="Calls, texts, Messenger, and your own website's quote form all land in the same place."
          />
        </div>

        <p className="text-sm text-slate-500 mt-14">
          Already have an account? <Link href="/login" className="underline">Log in</Link>
        </p>
      </div>
    </main>
  );
}

function Feature({ title, body }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600">{body}</p>
    </div>
  );
}
