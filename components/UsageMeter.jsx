// components/UsageMeter.jsx
// Small "X of Y free this month (+N credits)" indicator plus a buy-more
// button, shared by /quotes and /prospecting since both metered features
// use the same lib/usageCredits.js shape and the same Stripe credit-pack
// checkout flow.
'use client';

import { useState, useEffect, useCallback } from 'react';

const LABELS = {
  photo_quote: { key: 'photoQuote', unit: 'photo quotes' },
  prospecting_search: { key: 'prospectingSearch', unit: 'searches' },
};

export default function UsageMeter({ feature, refreshKey }) {
  const [usage, setUsage] = useState(null);
  const [buying, setBuying] = useState(false);
  const { key, unit } = LABELS[feature];

  const load = useCallback(() => {
    fetch('/api/usage')
      .then((res) => res.json())
      .then((data) => setUsage(data[key] || null))
      .catch(() => {});
  }, [key]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const buyMore = async () => {
    setBuying(true);
    try {
      const res = await fetch('/api/billing/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to start checkout');
        setBuying(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      alert('Failed to start checkout. Please try again.');
      setBuying(false);
    }
  };

  if (!usage) return null;

  const outOfFree = usage.freeRemaining === 0;

  return (
    <div className="flex items-center justify-between text-xs text-slate-500 mb-3 rounded bg-slate-50 border border-slate-200 px-3 py-2">
      <span>
        {usage.freeRemaining} of {usage.freeAllowance} free {unit} left this month
        {usage.credits > 0 && ` · ${usage.credits} purchased credit${usage.credits === 1 ? '' : 's'} available`}
      </span>
      {outOfFree && (
        <button onClick={buyMore} disabled={buying} className="text-red-700 underline font-medium disabled:opacity-50 whitespace-nowrap ml-2">
          {buying ? 'Loading...' : 'Buy more'}
        </button>
      )}
    </div>
  );
}
