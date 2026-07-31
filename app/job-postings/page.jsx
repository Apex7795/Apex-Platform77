'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

function formatCents(cents) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_LABELS = {
  open: 'Open',
  claimed: 'Claimed',
  completed: 'Completed',
  canceled: 'Canceled',
};
const STATUS_COLORS = {
  open: 'bg-green-100 text-green-800',
  claimed: 'bg-amber-100 text-amber-800',
  completed: 'bg-slate-200 text-slate-700',
  canceled: 'bg-red-100 text-red-700',
};

function StatusPill({ status }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function JobPostingsPage() {
  const [tab, setTab] = useState('marketplace'); // marketplace | mine | claimed | post
  const [postings, setPostings] = useState([]);
  const [myTenantId, setMyTenantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    title: '', description: '', city: '', state: '',
    estimated_value: '', commission_percent: '20',
  });
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(null);

  const [actionError, setActionError] = useState(null);
  const [completingId, setCompletingId] = useState(null);
  const [finalPrice, setFinalPrice] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/job-postings')
      .then((res) => res.json())
      .then((data) => {
        setPostings(Array.isArray(data.jobPostings) ? data.jobPostings : []);
        setMyTenantId(data.myTenantId || null);
      })
      .catch(() => setError('Failed to load job postings'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handlePost = async (e) => {
    e.preventDefault();
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch('/api/job-postings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          city: form.city,
          state: form.state,
          estimated_value_cents: form.estimated_value ? Math.round(Number(form.estimated_value) * 100) : null,
          commission_percent: form.commission_percent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post job');
      setForm({ title: '', description: '', city: '', state: '', estimated_value: '', commission_percent: '20' });
      setTab('mine');
      load();
    } catch (err) {
      setPostError(err.message);
    } finally {
      setPosting(false);
    }
  };

  const claimJob = async (id) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/job-postings/${id}/claim`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to claim job');
      load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const cancelJob = async (id) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/job-postings/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel job');
      load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const submitComplete = async (id) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/job-postings/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_price_cents: Math.round(Number(finalPrice) * 100) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mark job complete');
      setCompletingId(null);
      setFinalPrice('');
      load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const marketplace = postings.filter((p) => p.status === 'open' && p.posting_tenant_id !== myTenantId);
  const mine = postings.filter((p) => p.posting_tenant_id === myTenantId);
  const claimedByMe = postings.filter((p) => p.claimed_by_tenant_id === myTenantId);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Job Marketplace</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 underline">
          Back to dashboard
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Post work you can't reach for another tenant to claim, or pick up overflow jobs in a city
        you can service. The posting tenant earns their set commission automatically once a
        claimed job is marked complete — settle it between yourselves using the job tag as proof.
      </p>

      <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm mb-6 w-fit">
        {[
          ['marketplace', `Marketplace (${marketplace.length})`],
          ['mine', `My Postings (${mine.length})`],
          ['claimed', `My Claims (${claimedByMe.length})`],
          ['post', 'Post a Job'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 ${tab === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && tab === 'marketplace' && (
        <div className="space-y-3">
          {marketplace.length === 0 && (
            <p className="text-sm text-slate-500">No open jobs from other tenants right now.</p>
          )}
          {marketplace.map((job) => (
            <div key={job.id} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">{job.job_tag}</span>
                    <StatusPill status={job.status} />
                  </div>
                  <h3 className="font-semibold mt-1">{job.title}</h3>
                  <p className="text-sm text-slate-500">{job.city}, {job.state}</p>
                  {job.description && <p className="text-sm text-slate-600 mt-1">{job.description}</p>}
                  <p className="text-xs text-slate-500 mt-2">
                    Posted by {job.posting_business_name} · Est. value {formatCents(job.estimated_value_cents)} ·{' '}
                    <span className="font-medium">{Number(job.commission_percent)}% commission to poster</span>
                  </p>
                </div>
                <button
                  onClick={() => claimJob(job.id)}
                  className="shrink-0 rounded-lg bg-red-700 text-white text-sm font-semibold px-4 py-2 hover:bg-red-800 transition-colors"
                >
                  Claim
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'mine' && (
        <div className="space-y-3">
          {mine.length === 0 && <p className="text-sm text-slate-500">You haven't posted any jobs yet.</p>}
          {mine.map((job) => (
            <div key={job.id} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400">{job.job_tag}</span>
                <StatusPill status={job.status} />
              </div>
              <h3 className="font-semibold mt-1">{job.title}</h3>
              <p className="text-sm text-slate-500">{job.city}, {job.state}</p>
              {job.claimed_business_name && (
                <p className="text-sm text-slate-600 mt-1">Claimed by {job.claimed_business_name}</p>
              )}
              {job.status === 'completed' && (
                <p className="text-sm font-medium text-green-700 mt-1">
                  Final price {formatCents(job.final_price_cents)} — you're owed {formatCents(job.commission_owed_cents)}
                </p>
              )}
              {job.status === 'open' && (
                <button
                  onClick={() => cancelJob(job.id)}
                  className="mt-2 text-sm text-red-600 underline"
                >
                  Cancel posting
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'claimed' && (
        <div className="space-y-3">
          {claimedByMe.length === 0 && <p className="text-sm text-slate-500">You haven't claimed any jobs yet.</p>}
          {claimedByMe.map((job) => (
            <div key={job.id} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400">{job.job_tag}</span>
                <StatusPill status={job.status} />
              </div>
              <h3 className="font-semibold mt-1">{job.title}</h3>
              <p className="text-sm text-slate-500">{job.city}, {job.state}</p>
              <p className="text-xs text-slate-500 mt-1">
                Posted by {job.posting_business_name} · {Number(job.commission_percent)}% commission owed to them on completion
              </p>
              {job.status === 'completed' && (
                <p className="text-sm font-medium text-slate-700 mt-1">
                  Final price {formatCents(job.final_price_cents)} — you owe them {formatCents(job.commission_owed_cents)}
                </p>
              )}
              {job.status === 'claimed' && completingId !== job.id && (
                <button
                  onClick={() => setCompletingId(job.id)}
                  className="mt-2 rounded-lg bg-slate-900 text-white text-sm font-semibold px-3 py-1.5"
                >
                  Mark complete
                </button>
              )}
              {completingId === job.id && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-slate-500">Final price $</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={finalPrice}
                    onChange={(e) => setFinalPrice(e.target.value)}
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={() => submitComplete(job.id)}
                    disabled={!finalPrice}
                    className="rounded-lg bg-red-700 text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button onClick={() => { setCompletingId(null); setFinalPrice(''); }} className="text-sm text-slate-500 underline">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'post' && (
        <form onSubmit={handlePost} className="space-y-4 bg-white rounded-lg border border-slate-200 p-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Job title</label>
            <input
              type="text" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="e.g. Full house cleanout, 3BR"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input
                type="text" required value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Sacramento"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
              <input
                type="text" required value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="CA"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estimated value $ (optional)</label>
              <input
                type="number" min="0" step="0.01" value={form.estimated_value}
                onChange={(e) => setForm({ ...form, estimated_value: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your commission %</label>
              <input
                type="number" min="0" max="100" step="1" required value={form.commission_percent}
                onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>
          {postError && <p className="text-sm text-red-600">{postError}</p>}
          <button
            type="submit" disabled={posting}
            className="w-full rounded-lg bg-red-700 text-white font-semibold py-2 disabled:opacity-50 hover:bg-red-800 transition-colors"
          >
            {posting ? 'Posting…' : 'Post job to marketplace'}
          </button>
          <p className="text-xs text-slate-400">
            Whoever claims this owes you {form.commission_percent || 0}% of the final price once they mark it
            complete. This is tracked automatically on the platform — settle the actual payment between yourselves.
          </p>
        </form>
      )}
    </div>
  );
}
