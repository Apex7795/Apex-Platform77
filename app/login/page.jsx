'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { postJsonWithRetry } from '../../lib/fetchJsonWithRetry';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { ok, data } = await postJsonWithRetry('/api/auth/login', { email, password });
      if (!ok) {
        setError(data.error || 'Login failed');
        setSubmitting(false);
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setError('Something went wrong reaching the server. Please try again in a moment.');
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="max-w-sm w-full bg-white rounded-xl border border-slate-200 p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-6">Log in</h1>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 text-white font-semibold py-2 disabled:opacity-50"
          >
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p className="text-sm text-slate-500 mt-4">
          <Link href="/forgot-password" className="text-slate-900 underline">Forgot password?</Link>
        </p>
        <p className="text-sm text-slate-500 mt-2">
          No account? <Link href="/signup" className="text-slate-900 underline">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
