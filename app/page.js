import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Apex Platform</h1>
      <p>Lead generation and conversion platform for field services.</p>
      <nav style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/call-assistant">Call Assistant</Link>
        <Link href="/admin">Admin Panel</Link>
      </nav>
    </main>
  );
}
