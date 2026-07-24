import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LeadsTable from './LeadsTable';

export default function Dashboard() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [business, setBusiness] = useState(null);

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

  if (loading) return <div>Loading your leads...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Lead Pipeline</h1>
          {business?.businessName && <p className="text-sm text-slate-500">{business.businessName}</p>}
        </div>
        <div className="flex items-center gap-4">
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
      {loadError && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">
          Failed to load leads: {loadError}
        </div>
      )}
      <LeadsTable leads={leads} onStatusUpdate={handleStatusUpdate} />
      {business?.tenantId && <EmbedCodeSnippet tenantId={business.tenantId} />}
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
