import Link from 'next/link';
import ShareButtons from '../components/ShareButtons';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-2xl w-full text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-red-700 text-white text-xs font-semibold px-3 py-1 mb-6">
          APEX JUNK SOLUTIONS
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4">
          Stop losing jobs to chaos.
        </h1>
        <p className="text-lg text-slate-600 mb-4">
          Every call, text, Facebook message, and website quote request in one verified
          pipeline. AI-powered pricing your customers can use themselves. Your own local
          lead-generation engine. One dashboard, built for junk removal and field service.
        </p>

        <Link href="/how-it-works" className="inline-block text-red-700 underline font-semibold mb-10">
          See everything it does →
        </Link>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-14">
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

        <div className="grid sm:grid-cols-2 gap-4 text-left mb-14">
          <Feature title="Verified Leads" body="Every website quote request is checked against Twilio phone verification before it ever counts as a lead." />
          <Feature title="AI Photo Pricing" body="Upload job photos, get a transparent price in seconds. Your customers can do the same thing right on your website." />
          <Feature title="Full CRM Pipeline" body="List or Kanban board, search, tags, bulk actions, and automatic dead-lead follow-up." />
          <Feature title="Your Own Lead Engine" body="Search real local business listings for new customers in your own territory, whenever you want." />
        </div>

        <div className="rounded-xl border-2 border-red-700 bg-white p-8 max-w-sm mx-auto mb-10">
          <p className="text-sm font-semibold text-red-700 mb-1">Simple pricing</p>
          <p className="text-4xl font-bold text-slate-900 mb-1">
            $49<span className="text-lg font-medium text-slate-500">/month</span>
          </p>
          <p className="text-sm text-slate-500 mb-4">14-day free trial. Cancel anytime.</p>
          <ul className="text-sm text-slate-600 text-left space-y-1 mb-4">
            <li>✓ Every lead channel, one dashboard</li>
            <li>✓ Verified leads &amp; full CRM pipeline</li>
            <li>✓ Receipts &amp; one-click tax exports</li>
            <li>✓ AI photo pricing &amp; local lead search included monthly, more available anytime</li>
          </ul>
          <Link
            href="/signup"
            className="block text-center rounded-lg bg-red-700 px-6 py-3 text-white font-semibold hover:bg-red-800 transition-colors"
          >
            Start Free Trial
          </Link>
        </div>

        <ShareButtons />
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
