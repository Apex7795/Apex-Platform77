'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import UsageMeter from '../../components/UsageMeter';

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

const LOAD_SIZE_LABELS = {
  quarter: 'Quarter load',
  half: 'Half load',
  three_quarter: 'Three-quarter load',
  full: 'Full truck',
};

export default function QuotesPage() {
  const [mode, setMode] = useState('photo'); // photo | manual
  const [photos, setPhotos] = useState([]);
  const [travelMiles, setTravelMiles] = useState('');
  const [status, setStatus] = useState('idle'); // idle | analyzing | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [pastQuotes, setPastQuotes] = useState([]);
  const [usageRefreshKey, setUsageRefreshKey] = useState(0);
  const [suggestManual, setSuggestManual] = useState(false);
  const [loadSize, setLoadSize] = useState('half');
  const [accessDifficulty, setAccessDifficulty] = useState('medium');

  const loadPastQuotes = () => {
    fetch('/api/quotes')
      .then((res) => res.json())
      .then((data) => setPastQuotes(Array.isArray(data.quotes) ? data.quotes : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadPastQuotes();
  }, []);

  const handlePhotoChange = (e) => {
    setPhotos(Array.from(e.target.files || []).slice(0, 5));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (photos.length === 0) {
      setError('Add at least one photo of the job');
      return;
    }
    setStatus('analyzing');
    setError(null);
    setResult(null);
    setSuggestManual(false);

    try {
      const formData = new FormData();
      photos.forEach((photo) => formData.append('photos', photo));
      if (travelMiles) formData.append('travelMiles', travelMiles);

      const res = await fetch('/api/quotes/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      setUsageRefreshKey((k) => k + 1);
      if (!res.ok) {
        setError(data.error || 'Failed to analyze photos');
        setStatus('error');
        // A 503 here specifically means "AI isn't configured/funded yet"
        // (see app/api/quotes/analyze/route.js) -- offer the no-AI path
        // instead of a dead end.
        if (res.status === 503) setSuggestManual(true);
        return;
      }
      setResult(data);
      setStatus('done');
      loadPastQuotes();
    } catch {
      setError('Something went wrong reaching the server. Please try again.');
      setStatus('error');
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setStatus('analyzing');
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/quotes/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadSize, accessDifficulty, travelMiles }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save quote');
        setStatus('error');
        return;
      }
      setResult(data);
      setStatus('done');
      loadPastQuotes();
    } catch {
      setError('Something went wrong reaching the server. Please try again.');
      setStatus('error');
    }
  };

  const reset = () => {
    setPhotos([]);
    setTravelMiles('');
    setResult(null);
    setError(null);
    setSuggestManual(false);
    setStatus('idle');
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Photo Quote Estimator</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 underline">
          Back to dashboard
        </Link>
      </div>

      {mode === 'photo' && <UsageMeter feature="photo_quote" refreshKey={usageRefreshKey} />}

      {status !== 'done' && (
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm mb-4 w-fit">
          <button
            onClick={() => { setMode('photo'); setError(null); setSuggestManual(false); }}
            className={`px-4 py-1.5 ${mode === 'photo' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}
          >
            Upload Photos
          </button>
          <button
            onClick={() => { setMode('manual'); setError(null); setSuggestManual(false); }}
            className={`px-4 py-1.5 ${mode === 'manual' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}
          >
            Estimate Manually
          </button>
        </div>
      )}

      {status !== 'done' && mode === 'photo' && (
        <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-lg border border-slate-200 p-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Photos of the job (up to 5)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
              className="w-full text-sm"
            />
            {photos.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">{photos.length} photo(s) selected</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Travel distance (miles, optional)
            </label>
            <input
              type="number"
              min="0"
              value={travelMiles}
              onChange={(e) => setTravelMiles(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="e.g. 12"
            />
          </div>
          {error && (
            <div>
              <p className="text-sm text-red-600">{error}</p>
              {suggestManual && (
                <button
                  type="button"
                  onClick={() => { setMode('manual'); setError(null); setSuggestManual(false); }}
                  className="text-sm text-red-700 underline font-medium mt-1"
                >
                  Try a manual estimate instead →
                </button>
              )}
            </div>
          )}
          <button
            type="submit"
            disabled={status === 'analyzing'}
            className="w-full rounded-lg bg-red-700 text-white font-semibold py-2 disabled:opacity-50 hover:bg-red-800 transition-colors"
          >
            {status === 'analyzing' ? 'Analyzing photos...' : 'Analyze & Get Suggested Price'}
          </button>
          <p className="text-xs text-slate-400">
            This is an estimate based only on what's visible in the photos -- use your own judgment
            before quoting a customer.
          </p>
        </form>
      )}

      {status !== 'done' && mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="space-y-4 bg-white rounded-lg border border-slate-200 p-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Load size</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(LOAD_SIZE_LABELS).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setLoadSize(value)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    loadSize === value ? 'border-red-700 bg-red-50 text-red-700 font-semibold' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Access difficulty</label>
            <select
              value={accessDifficulty}
              onChange={(e) => setAccessDifficulty(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="very_hard">Very hard</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Travel distance (miles, optional)
            </label>
            <input
              type="number"
              min="0"
              value={travelMiles}
              onChange={(e) => setTravelMiles(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="e.g. 12"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={status === 'analyzing'}
            className="w-full rounded-lg bg-red-700 text-white font-semibold py-2 disabled:opacity-50 hover:bg-red-800 transition-colors"
          >
            {status === 'analyzing' ? 'Calculating...' : 'Get Suggested Price'}
          </button>
          <p className="text-xs text-slate-400">
            Same transparent labor/disposal/travel math as the photo estimator -- just based on your
            own judgment of the load instead of photos.
          </p>
        </form>
      )}

      {status === 'done' && result && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center">
            <p className="text-sm text-red-700 font-medium mb-1">Suggested Price</p>
            <p className="text-3xl font-bold text-slate-900">{formatCents(result.pricing.suggestedPriceCents)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Volume</p>
              <p className="font-semibold">{result.analysis.volume_cubic_yards} yd³</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Access</p>
              <p className="font-semibold capitalize">{result.analysis.access_difficulty.replace('_', ' ')}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Est. Time</p>
              <p className="font-semibold">{result.analysis.time_estimate_hours} hrs</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Cost Breakdown</p>
            <div className="text-sm text-slate-600 space-y-1">
              <div className="flex justify-between"><span>Labor</span><span>{formatCents(result.pricing.costLaborCents)}</span></div>
              <div className="flex justify-between"><span>Disposal</span><span>{formatCents(result.pricing.costDisposalCents)}</span></div>
              <div className="flex justify-between"><span>Travel</span><span>{formatCents(result.pricing.costTravelCents)}</span></div>
            </div>
          </div>

          {result.analysis.material_breakdown && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Materials</p>
              <div className="text-sm text-slate-600 space-y-1">
                {Object.entries(result.analysis.material_breakdown).map(([material, pct]) => (
                  <div key={material} className="flex justify-between capitalize">
                    <span>{material.replace(/_/g, ' ')}</span>
                    <span>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.analysis.notes && (
            <p className="text-xs text-slate-500 italic">{result.analysis.notes}</p>
          )}

          <button
            onClick={reset}
            className="w-full rounded-lg border border-slate-300 text-slate-700 font-semibold py-2 hover:bg-slate-50 transition-colors"
          >
            New Quote
          </button>
        </div>
      )}

      {pastQuotes.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-slate-900 mb-3">Past Quotes</h2>
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {pastQuotes.map((q) => (
              <div key={q.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0 text-sm">
                <div>
                  <p className="font-medium">{q.volume_cubic_yards} yd³ · {q.access_difficulty?.replace('_', ' ')}</p>
                  <p className="text-slate-500 text-xs">{new Date(q.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold">{formatCents(q.suggested_price_cents)}</p>
                  <Link
                    href={`/receipts?quoteId=${q.id}&price=${(q.suggested_price_cents / 100).toFixed(2)}`}
                    className="text-red-700 underline text-xs whitespace-nowrap"
                  >
                    Record Receipt
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
