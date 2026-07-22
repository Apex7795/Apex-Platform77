import { useState, useEffect } from 'react';
import LeadsTable from './LeadsTable';

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Fetch leads on mount
  useEffect(() => {
    fetch('/api/leads')
      .then(async (res) => {
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
  }, []);

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
      <h1 className="text-2xl font-bold mb-4">Lead Pipeline</h1>
      {loadError && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-700">
          Failed to load leads: {loadError}
        </div>
      )}
      <LeadsTable leads={leads} onStatusUpdate={handleStatusUpdate} />
    </div>
  );
}
