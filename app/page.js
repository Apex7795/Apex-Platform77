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
          Lead intelligence for field&nbsp;service
        </h1>
        <p className="text-lg text-slate-600 mb-4">
          Call tracking, conversion scoring, and automated prospect outreach — so haulers
          stop chasing leads and keep their trucks on the road.
        </p>

        <Link href="/how-it-works" className="inline-block text-slate-700 underline font-medium mb-10">
          See how it works →
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

        <div className="grid sm:grid-cols-3 gap-4 text-left mb-14">
          <Feature title="Call Tracking" body="Every inbound call is logged, recorded, and matched to the caller's history." />
          <Feature title="Conversion Scoring" body="Prospects ranked 0–95% by likelihood to book, from real signals." />
          <Feature title="Auto Outreach" body="Personalized email sequences with built-in opt-out compliance." />
        </div>

        <div className="rounded-xl border-2 border-red-700 bg-white p-8 max-w-sm mx-auto mb-10">
          <p className="text-sm font-semibold text-red-700 mb-1">Simple pricing</p>
          <p className="text-4xl font-bold text-slate-900 mb-1">
            $49<span className="text-lg font-medium text-slate-500">/month</span>
          </p>
          <p className="text-sm text-slate-500 mb-4">14-day free trial. Cancel anytime.</p>
          <ul className="text-sm text-slate-600 text-left space-y-1 mb-4">
            <li>✓ Call tracking &amp; recording</li>
            <li>✓ Verified leads from your website</li>
            <li>✓ Missed-call auto follow-up</li>
            <li>✓ One dashboard for every channel</li>
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
