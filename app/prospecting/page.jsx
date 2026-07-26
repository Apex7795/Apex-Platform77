'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STATUS_LABELS = {
  discovered: 'Discovered',
  enriched: 'Enriched',
  contacted: 'Contacted',
  won: 'Won',
  lost: 'Lost',
};

export default function ProspectingPage() {
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const loadProspects = () => {
    setLoading(true);
    fetch('/api/tenant-prospects')
      .then((res) => res.json())
      .then((data) => setProspects(Array.isArray(data.prospects) ? data.prospects : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProspects();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!city.trim() || !query.trim()) {
      setError('Enter both a city and an industry keyword');
      return;
    }
    setSearching(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch('/api/tenant-prospects/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to run prospecting');
        setSearching(false);
        return;
      }
      setLastResult(data);
      loadProspects();
    } catch {
      setError('Something went wrong reaching the server. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const updateStatus = async (id, status) => {
    const previous = [...prospects];
    setProspects(prospects.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      const res = await fetch(`/api/tenant-prospects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch {
      setProspects(previous);
      alert('Failed to update status. Please try again.');
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Find Local Leads</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 underline">
          Back to dashboard
        </Link>
      </div>

      <form onSubmit={handleSearch} className="bg-white rounded-lg border border-slate-200 p-6 space-y-4 mb-8">
        <h2 className="font-semibold text-slate-900">Search for prospects in your area</h2>
        <p className="text-sm text-slate-600">
          Searches real business listings (Google Places) for potential customers -- property
          managers, contractors, real estate agents, whatever fits your business -- and tries to
          find a contact email for each one.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Sacramento, CA"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Industry keyword</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. property management"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {lastResult && (
          <p className="text-sm text-green-700">
            Found {lastResult.found}, added {lastResult.inserted} new ({lastResult.enriched} with an email found).
          </p>
        )}
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg bg-red-700 text-white font-semibold px-6 py-2 disabled:opacity-50 hover:bg-red-800 transition-colors"
        >
          {searching ? 'Searching...' : 'Find Leads'}
        </button>
        <p className="text-xs text-slate-400">Up to 3 searches per day.</p>
      </form>

      <h2 className="font-semibold text-slate-900 mb-3">Your Prospects</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : prospects.length === 0 ? (
        <p className="text-sm text-slate-500">No prospects yet -- run a search above.</p>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {prospects.map((p) => (
            <div key={p.id} className="px-4 py-3 border-b border-slate-100 last:border-0 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.business_name}</p>
                  <p className="text-slate-500 text-xs truncate">
                    {[p.phone, p.email].filter(Boolean).join(' · ') || 'No contact info found'}
                  </p>
                  {p.website && (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-red-700 underline text-xs"
                    >
                      {p.website}
                    </a>
                  )}
                </div>
                <select
                  value={p.status}
                  onChange={(e) => updateStatus(p.id, e.target.value)}
                  className="shrink-0 rounded border border-slate-300 text-xs px-2 py-1"
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
