'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/src/context/AuthContext';

export default function AdminPage() {
  const { authenticated, loading, login, logout } = useAuth();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState(null);
  const [prospects, setProspects] = useState([]);
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [discoveryStatus, setDiscoveryStatus] = useState(null);

  useEffect(() => {
    if (!authenticated) return;

    fetch('/api/prospects', {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
    })
      .then((res) => res.json())
      .then((data) => setProspects(data.prospects || []))
      .catch(() => setProspects([]));
  }, [authenticated]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await response.json();
      if (!response.ok) {
        setLoginError(data.error || 'Login failed');
        return;
      }
      await login(data.token);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleDiscover = async (event) => {
    event.preventDefault();
    setDiscoveryStatus('Running...');

    try {
      const response = await fetch('/api/prospects/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ query: discoveryQuery }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Discovery failed');
      setDiscoveryStatus(`Discovered ${data.discovered}, added ${data.created} new prospects.`);
    } catch (err) {
      setDiscoveryStatus(`Error: ${err.message}`);
    }
  };

  if (loading) return <p style={{ padding: '2rem' }}>Loading...</p>;

  if (!authenticated) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Admin Login</h1>
        <form
          onSubmit={handleLogin}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '300px' }}
        >
          <input
            placeholder="Username"
            value={credentials.username}
            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            value={credentials.password}
            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
          />
          <button type="submit">Sign in</button>
        </form>
        {loginError && <p style={{ color: 'red' }}>{loginError}</p>}
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem' }}>
      <h1>Admin Panel</h1>
      <button onClick={logout}>Sign out</button>

      <section style={{ marginTop: '2rem' }}>
        <h2>Discover New Prospects</h2>
        <form onSubmit={handleDiscover} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            placeholder="e.g. plumbers in Austin, TX"
            value={discoveryQuery}
            onChange={(e) => setDiscoveryQuery(e.target.value)}
          />
          <button type="submit">Run discovery</button>
        </form>
        {discoveryStatus && <p>{discoveryStatus}</p>}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Prospects</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Rating</th>
              <th>Reviews</th>
              <th>Score</th>
              <th>Probability</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.rating ?? '-'}</td>
                <td>{p.review_count}</td>
                <td>{p.conversion_score}</td>
                <td>{p.conversion_probability}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
