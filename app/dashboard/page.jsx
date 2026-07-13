'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/src/context/AuthContext';

export default function DashboardPage() {
  const { authenticated, loading } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authenticated) return;

    const fetchSummary = async () => {
      try {
        const response = await fetch('/api/analytics/summary', {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        });
        if (!response.ok) throw new Error('Failed to load analytics');
        setSummary(await response.json());
      } catch (err) {
        setError(err.message);
      }
    };

    fetchSummary();
  }, [authenticated]);

  if (loading) return <p style={{ padding: '2rem' }}>Loading...</p>;
  if (!authenticated) return <p style={{ padding: '2rem' }}>Please sign in via the Admin Panel to view the dashboard.</p>;
  if (error) return <p style={{ padding: '2rem', color: 'red' }}>Error: {error}</p>;
  if (!summary) return <p style={{ padding: '2rem' }}>Loading analytics...</p>;

  return (
    <main style={{ padding: '2rem' }}>
      <h1>Dashboard</h1>

      <section>
        <h2>Leads by Status</h2>
        <ul>
          {summary.leads_by_status.map((row) => (
            <li key={row.status}>{row.status}: {row.count}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Prospects</h2>
        <p>Total: {summary.prospects.total}</p>
        <p>Avg. conversion probability: {summary.prospects.avg_probability?.toFixed(1) ?? 0}%</p>
      </section>

      <section>
        <h2>Booked Jobs by Status</h2>
        <ul>
          {summary.booked_jobs_by_status.map((row) => (
            <li key={row.status}>
              {row.status}: {row.count} (${row.commission.toFixed(2)} commission)
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
