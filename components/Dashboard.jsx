import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LeadsTable from './LeadsTable';
import LeadsKanban from './LeadsKanban';

export default function Dashboard() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [business, setBusiness] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState('list');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('contacted');

  // Fetch leads on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          router.replace('/login');
          throw new Error('Not logged in');
        }
        return res.json();
      })
      .then((me) => setBusiness(me))
      .catch(() => {});

    fetch('/api/leads')
      .then(async (res) => {
        if (res.status === 401) {
          router.replace('/login');
          throw new Error('Not logged in');
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Request failed with status ${res.status}`);
        }
        return data;
      })
      .then((data) => {
        setLeads(Array.isArray(data.leads) ? data.leads : []);
        setLoadError(null);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load leads:', err);
        setLeads([]);
        setLoadError(err.message);
        setLoading(false);
      });
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  };

  // Handle status updates
  const handleStatusUpdate = async (id, newStatus) => {
    // 1. Optimistic UI update: change local state immediately
    const previousLeads = [...leads];
    setLeads(leads.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));

    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch (err) {
      console.error(err);
      // 2. Revert on error
      setLeads(previousLeads);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleTagsUpdate = async (id, newTags) => {
    const previousLeads = [...leads];
    setLeads(leads.map((l) => (l.id === id ? { ...l, tags: newTags } : l)));
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch (err) {
      console.error(err);
      setLeads(previousLeads);
      alert('Failed to update tags. Please try again.');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkStatus = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const previousLeads = [...leads];
    setLeads(leads.map((l) => (selectedIds.has(l.id) ? { ...l, status: bulkStatus } : l)));
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/leads/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: bulkStatus }),
          })
        )
      );
      if (results.some((res) => !res.ok)) throw new Error('One or more updates failed');
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      setLeads(previousLeads);
      alert('Failed to update one or more leads. Please try again.');
    }
  };

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (term && !l.caller_number?.toLowerCase().includes(term) && !(l.tags || []).some((t) => t.toLowerCase().includes(term))) {
        return false;
      }
      return true;
    });
  }, [leads, search, statusFilter]);

  if (loading) return <div>Loading your leads...</div>;

  // Hard paywall: a lapsed or canceled subscription blocks the dashboard
  // entirely rather than just showing a banner -- the whole point of
  // wiring up billing is that non-paying accounts stop having access.
  // Admin accounts (platform staff, not paying tenants) are exempt --
  // there's no reason the owner's own account should get locked out by
  // the same subscription paywall that gates customers.
  const locked =
    business?.role !== 'admin' &&
    (business?.subscriptionStatus === 'past_due' || business?.subscriptionStatus === 'canceled');

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Lead Pipeline</h1>
          {business?.businessName && <p className="text-sm text-slate-500">{business.businessName}</p>}
        </div>
        <div className="flex items-center gap-4">
          <Link href="/prospecting" className="text-sm text-slate-500 hover:text-slate-800 underline">
            Find Local Leads
          </Link>
          <Link href="/quotes" className="text-sm text-slate-500 hover:text-slate-800 underline">
            Photo Quote Estimator
          </Link>
          <Link href="/receipts" className="text-sm text-slate-500 hover:text-slate-800 underline">
            Receipts
          </Link>
          <Link href="/job-postings" className="text-sm text-slate-500 hover:text-slate-800 underline">
            Job Marketplace
          </Link>
          {business?.role === 'admin' && (
            <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-800 underline">
              All Tenants (Admin)
            </Link>
          )}
          <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-800 underline">
            Log out
          </button>
        </div>
      </div>
      {business?.subscriptionStatus && <BillingBanner status={business.subscriptionStatus} />}
      {locked ? (
        <BillingPaywall />
      ) : (
        <>
          {loadError && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">
              Failed to load leads: {loadError}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone number or tag..."
              className="rounded border border-slate-300 px-3 py-1.5 text-sm flex-1 min-w-[180px]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
            <div className="flex rounded border border-slate-300 overflow-hidden text-sm">
              <button
                onClick={() => setView('list')}
                className={`px-3 py-1.5 ${view === 'list' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}
              >
                List
              </button>
              <button
                onClick={() => setView('board')}
                className={`px-3 py-1.5 ${view === 'board' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}
              >
                Board
              </button>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm">
              <span>{selectedIds.size} selected</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
              <button onClick={applyBulkStatus} className="rounded bg-red-700 text-white px-3 py-1 font-medium hover:bg-red-800">
                Apply
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-slate-500 underline">
                Clear
              </button>
            </div>
          )}

          {view === 'list' ? (
            <LeadsTable
              leads={filteredLeads}
              onStatusUpdate={handleStatusUpdate}
              onTagsUpdate={handleTagsUpdate}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          ) : (
            <LeadsKanban leads={filteredLeads} onStatusUpdate={handleStatusUpdate} />
          )}

          {business?.tenantId && <EmbedCodeSnippet tenantId={business.tenantId} />}
        </>
      )}
    </div>
  );
}

function useCheckout() {
  const [starting, setStarting] = useState(false);
  const startCheckout = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to start checkout');
        setStarting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      alert('Failed to start checkout. Please try again.');
      setStarting(false);
    }
  };
  return { starting, startCheckout };
}

function BillingBanner({ status }) {
  const { starting, startCheckout } = useCheckout();
  if (status === 'active') return null;

  const copy = {
    trialing: { text: "You're on a free trial.", tone: 'bg-slate-50 border-slate-200 text-slate-700' },
    past_due: { text: 'Your last payment failed.', tone: 'bg-red-50 border-red-300 text-red-700' },
    canceled: { text: 'Your subscription is canceled.', tone: 'bg-red-50 border-red-300 text-red-700' },
  }[status];
  if (!copy) return null;

  return (
    <div className={`mb-4 flex items-center justify-between rounded border px-4 py-2 text-sm ${copy.tone}`}>
      <span>{copy.text}</span>
      <button onClick={startCheckout} disabled={starting} className="underline font-medium disabled:opacity-50">
        {starting ? 'Loading...' : status === 'trialing' ? 'Add payment method' : 'Update billing'}
      </button>
    </div>
  );
}

function BillingPaywall() {
  const { starting, startCheckout } = useCheckout();
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">Subscription required</h2>
      <p className="text-sm text-slate-600 mb-4">
        Your access is paused until billing is up to date. Your leads are safe and will be here as soon as
        you resubscribe.
      </p>
      <button
        onClick={startCheckout}
        disabled={starting}
        className="rounded-lg bg-red-700 text-white font-semibold px-6 py-2 disabled:opacity-50 hover:bg-red-800 transition-colors"
      >
        {starting ? 'Loading...' : 'Resubscribe'}
      </button>
    </div>
  );
}

function EmbedCodeSnippet({ tenantId }) {
  const [copied, setCopied] = useState(false);
  // window.location.origin, not a hardcoded/env domain, so this snippet
  // is always correct for wherever the app is actually running (same
  // reasoning as components/ShareButtons.jsx).
  const snippet =
    typeof window !== 'undefined'
      ? `<script src="${window.location.origin}/widget.js" data-tenant-id="${tenantId}"></script>`
      : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable -- fail quietly.
    }
  };

  return (
    <div className="mt-8 rounded-lg border border-slate-200 p-5">
      <h2 className="font-semibold text-slate-900 mb-1">Get leads from your own website</h2>
      <p className="text-sm text-slate-600 mb-3">
        Paste this snippet into your own website's HTML. It adds a "Get a Quote" button that sends
        quote requests straight into this dashboard.
      </p>
      <div className="flex items-start gap-2">
        <code className="flex-1 block bg-slate-50 border border-slate-200 rounded p-3 text-xs overflow-x-auto whitespace-pre">
          {snippet}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
