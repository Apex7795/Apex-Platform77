'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ customerName: '', finalPrice: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadReceipts = () => {
    setLoading(true);
    fetch('/api/receipts')
      .then((res) => res.json())
      .then((data) => {
        setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
        setSummary(data.summary || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReceipts();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const price = parseFloat(form.finalPrice);
    if (!price || price <= 0) {
      setError('Enter a valid final price');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customerName || null,
          finalPriceCents: Math.round(price * 100),
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save receipt');
        setSubmitting(false);
        return;
      }
      setForm({ customerName: '', finalPrice: '', notes: '' });
      loadReceipts();
    } catch {
      setError('Something went wrong reaching the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const exportCsv = () => {
    window.open(`/api/receipts/export?year=${new Date().getFullYear()}`, '_blank');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Receipts</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 underline">
          Back to dashboard
        </Link>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg bg-white border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-500">Jobs Recorded</p>
            <p className="text-xl font-bold">{summary.count}</p>
          </div>
          <div className="rounded-lg bg-white border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-500">Total Income</p>
            <p className="text-xl font-bold">{formatCents(summary.totalCents)}</p>
          </div>
          <div className="rounded-lg bg-white border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-500">Average Job</p>
            <p className="text-xl font-bold">{formatCents(summary.averageCents)}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-6 space-y-4 mb-8">
        <h2 className="font-semibold text-slate-900">Record a completed job</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Customer name (optional)</label>
            <input
              type="text"
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Final price ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={form.finalPrice}
              onChange={(e) => setForm({ ...form, finalPrice: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-red-700 text-white font-semibold px-6 py-2 disabled:opacity-50 hover:bg-red-800 transition-colors"
        >
          {submitting ? 'Saving...' : 'Save Receipt'}
        </button>
      </form>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900">History</h2>
        {receipts.length > 0 && (
          <button onClick={exportCsv} className="text-sm text-red-700 underline">
            Export this year (CSV)
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : receipts.length === 0 ? (
        <p className="text-sm text-slate-500">No receipts recorded yet.</p>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {receipts.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0 text-sm">
              <div>
                <p className="font-medium">{r.customer_name || 'Customer'}</p>
                <p className="text-slate-500 text-xs">{new Date(r.completed_at).toLocaleDateString()}</p>
              </div>
              <p className="font-semibold">{formatCents(r.final_price_cents)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
