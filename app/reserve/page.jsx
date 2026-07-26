'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ReservePage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', businessName: '' });
  const [status, setStatus] = useState('idle'); // idle | submitting | done | error
  const [error, setError] = useState(null);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    setError(null);
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'facebook_group' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch {
      setError('Something went wrong reaching the server. Please try again.');
      setStatus('error');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="max-w-sm w-full bg-white rounded-xl border border-slate-200 p-8">
        {status === 'done' ? (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-2">You're on the list</h1>
            <p className="text-sm text-slate-600">
              We'll email you a signup link as soon as your spot is ready. No payment info needed right now.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-1">Reserve your spot</h1>
            <p className="text-sm text-slate-600 mb-6">
              First 100 people get a free extended trial. No payment info required to reserve —
              we'll email you when it's time to activate.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Your name" value={form.name} onChange={update('name')} required />
              <Field label="Email" type="email" value={form.email} onChange={update('email')} required />
              <Field label="Phone" type="tel" value={form.phone} onChange={update('phone')} />
              <Field label="Business name" value={form.businessName} onChange={update('businessName')} />
              {/* Honeypot -- real visitors never see or fill this in */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                onChange={update('website')}
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}
                aria-hidden="true"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full rounded-lg bg-red-700 text-white font-semibold py-2 disabled:opacity-50 hover:bg-red-800 transition-colors"
              >
                {status === 'submitting' ? 'Reserving...' : 'Reserve My Spot'}
              </button>
            </form>
          </>
        )}
        <p className="text-sm text-slate-500 mt-4">
          Ready to start now instead? <Link href="/signup" className="text-red-700 underline">Sign up</Link>
        </p>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = 'text', required }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
      />
    </div>
  );
}
