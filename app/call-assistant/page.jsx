'use client';

import { useState } from 'react';
import { useAuth } from '@/src/context/AuthContext';

export default function CallAssistantPage() {
  const { authenticated, loading } = useAuth();
  const [phone, setPhone] = useState('');
  const [lead, setLead] = useState(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);

  const lookup = async (event) => {
    event.preventDefault();
    setError(null);
    setSearched(true);

    try {
      const response = await fetch(`/api/leads?phone=${encodeURIComponent(phone)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
      });
      if (!response.ok) throw new Error('Lookup failed');
      const data = await response.json();
      setLead(data.leads[0] || null);
    } catch (err) {
      setError(err.message);
      setLead(null);
    }
  };

  if (loading) return <p style={{ padding: '2rem' }}>Loading...</p>;
  if (!authenticated) return <p style={{ padding: '2rem' }}>Please sign in via the Admin Panel to use the Call Assistant.</p>;

  return (
    <main style={{ padding: '2rem' }}>
      <h1>Call Assistant</h1>
      <p>Look up caller context by phone number.</p>

      <form onSubmit={lookup} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="tel"
          placeholder="+15551234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button type="submit">Look up</button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {lead && (
        <section style={{ marginTop: '1rem' }}>
          <h2>{lead.prospect_name || 'Unknown prospect'}</h2>
          <p>Status: {lead.status}</p>
          <p>Conversion probability: {lead.conversion_probability ?? 'N/A'}%</p>
          <p>Last contact: {new Date(lead.updated_at).toLocaleString()}</p>
        </section>
      )}

      {searched && !lead && !error && <p>No matching lead found.</p>}
    </main>
  );
}
