'use client';

// Platform-owner admin view: every tenant, not just one. Distinct from
// the regular /dashboard, which is always scoped to the logged-in
// session's own tenant regardless of role.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/admin/tenants')
      .then(async (res) => {
        if (res.status === 401) {
          router.replace('/login');
          throw new Error('Not logged in');
        }
        if (res.status === 403) {
          setError('This account does not have admin access.');
          throw new Error('Forbidden');
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        return data;
      })
      .then((data) => setTenants(data.tenants))
      .catch(() => {});
  }, [router]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!tenants) return <div className="p-6">Loading tenants...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-1">All Tenants</h1>
      <p className="text-sm text-slate-500 mb-4">{tenants.length} business{tenants.length === 1 ? '' : 'es'} signed up</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2">Business</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Leads</th>
              <th className="px-4 py-2">Signed up</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-t border-slate-200">
                <td className="px-4 py-2 font-medium">{t.business_name}</td>
                <td className="px-4 py-2">{t.owner_email}</td>
                <td className="px-4 py-2">{t.subscription_status}</td>
                <td className="px-4 py-2">{t.leadCount}</td>
                <td className="px-4 py-2">{new Date(t.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
