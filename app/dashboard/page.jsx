'use client';

// Wires the existing Dashboard component (components/Dashboard.jsx) into a real
// route. The 'use client' directive here makes this and everything it imports
// run on the client, which the Dashboard needs (useState/useEffect + fetch).
//
// Note: the leads list fetches /api/leads, which is scoped to whichever
// tenant the logged-in user's session belongs to (see lib/session.js) —
// Dashboard.jsx itself redirects to /login if there's no valid session.
import Dashboard from '../../components/Dashboard';

export default function DashboardPage() {
  return <Dashboard />;
}
