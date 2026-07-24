'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: '',
    serviceType: '',
    serviceArea: '',
    ownerEmail: '',
    ownerPhone: '',
    password: '',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Signup failed');
        setSubmitting(false);
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setError('Something went wrong. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="max-w-sm w-full bg-white rounded-xl border border-slate-200 p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-6">Create your account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Business name" value={form.businessName} onChange={update('businessName')} required />
          <Field label="Service type" value={form.serviceType} onChange={update('serviceType')} placeholder="e.g. junk_removal, landscaping" />
          <Field label="Service area" value={form.serviceArea} onChange={update('serviceArea')} placeholder="e.g. Sacramento, CA" />
          <Field label="Your email" type="email" value={form.ownerEmail} onChange={update('ownerEmail')} required />
          <Field label="Your phone" type="tel" value={form.ownerPhone} onChange={update('ownerPhone')} required />
          <Field label="Password" type="password" value={form.password} onChange={update('password')} required minLength={8} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 text-white font-semibold py-2 disabled:opacity-50"
          >
            {submitting ? 'Creating account...' : 'Sign up'}
          </button>
        </form>
        <p className="text-sm text-slate-500 mt-4">
          Already have an account? <Link href="/login" className="text-slate-900 underline">Log in</Link>
        </p>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = 'text', required, placeholder, minLength }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
      />
    </div>
  );
}
