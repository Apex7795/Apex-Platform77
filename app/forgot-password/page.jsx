'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      // The API always returns the same generic message whether or not
      // the account exists -- shown as-is, not treated as an error state.
      setMessage(data.message || 'If an account exists for that email, a reset link has been sent.');
    } catch {
      setMessage('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-sm w-full bg-white rounded-xl border border-slate-200 p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-6">Reset your password</h1>
        {message ? (
          <p className="text-sm text-slate-700">{message}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 text-white font-semibold py-2 disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="text-sm text-slate-500 mt-4">
          <Link href="/login" className="text-slate-900 underline">Back to log in</Link>
        </p>
      </div>
    </main>
  );
}
