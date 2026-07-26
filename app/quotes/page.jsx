'use client';

import { useState } from 'react';
import Link from 'next/link';

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function QuotesPage() {
  const [photos, setPhotos] = useState([]);
  const [travelMiles, setTravelMiles] = useState('');
  const [status, setStatus] = useState('idle'); // idle | analyzing | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

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

    try {
      const formData = new FormData();
      photos.forEach((photo) => formData.append('photos', photo));
      if (travelMiles) formData.append('travelMiles', travelMiles);

      const res = await fetch('/api/quotes/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to analyze photos');
        setStatus('error');
        return;
      }
      setResult(data);
      setStatus('done');
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

      {status !== 'done' && (
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
          {error && <p className="text-sm text-red-600">{error}</p>}
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
    </div>
  );
}
