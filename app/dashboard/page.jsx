'use client';

// Wires the existing Dashboard component (components/Dashboard.jsx) into a real
// route. The 'use client' directive here makes this and everything it imports
// run on the client, which the Dashboard needs (useState/useEffect + fetch).
//
// Note: the leads list fetches /api/leads, which is scoped to the single
// PRIMARY_TENANT_ID this deployment serves (see app/api/leads/route.js) —
// not a per-user session, since this app currently serves one business.
import Dashboard from '../../components/Dashboard';

export default function DashboardPage() {
  return <Dashboard />;
}
