// components/LeadsTable.jsx
import { useState } from 'react';

function VerificationBadge({ lead }) {
  // phone_verified is NULL for call/SMS leads (verification doesn't apply
  // -- Twilio's own network already proves those numbers are live) and for
  // form leads submitted before this feature shipped or while Lookup was
  // briefly unreachable. Only render a badge when there's something real
  // to say.
  if (lead.source !== 'form' || lead.phone_verified === null || lead.phone_verified === undefined) {
    return null;
  }
  if (lead.phone_verified) {
    const label = lead.phone_line_type ? `Verified (${lead.phone_line_type})` : 'Verified';
    return (
      <span
        className="ml-2 inline-block rounded-full bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5"
        title="Confirmed real, active phone number via Twilio Lookup"
      >
        ✓ {label}
      </span>
    );
  }
  return (
    <span
      className="ml-2 inline-block rounded-full bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5"
      title="Twilio Lookup could not confirm this number is real"
    >
      Unverified
    </span>
  );
}

function TagList({ lead, onTagsUpdate }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const tags = lead.tags || [];

  const removeTag = (tag) => onTagsUpdate(lead.id, tags.filter((t) => t !== tag));

  const submitTag = (e) => {
    e.preventDefault();
    const value = draft.trim();
    if (value && !tags.includes(value)) {
      onTagsUpdate(lead.id, [...tags, value]);
    }
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 text-xs px-2 py-0.5"
        >
          {tag}
          <button onClick={() => removeTag(tag)} className="text-slate-400 hover:text-slate-700" aria-label={`Remove tag ${tag}`}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <form onSubmit={submitTag} className="inline-flex">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitTag}
            maxLength={30}
            className="w-20 text-xs border border-slate-300 rounded px-1 py-0.5"
          />
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-slate-400 hover:text-slate-700">
          + tag
        </button>
      )}
    </div>
  );
}

export default function LeadsTable({ leads, onStatusUpdate, onTagsUpdate, selectedIds, onToggleSelect }) {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="hidden md:table-header-group">
        <tr>
          <th className="text-left py-2 w-8"></th>
          <th className="text-left py-2">Date</th>
          <th className="text-left py-2">Caller</th>
          <th className="text-left py-2">Status</th>
          <th className="text-left py-2">Recording</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((lead) => (
          <tr key={lead.id} className="flex flex-col md:table-row border-b md:border-none p-4 md:p-0">
            <td className="md:table-cell py-1 md:py-2 align-top">
              <input
                type="checkbox"
                checked={selectedIds?.has(lead.id) || false}
                onChange={() => onToggleSelect(lead.id)}
                aria-label={`Select lead ${lead.caller_number}`}
              />
            </td>
            <td className="md:table-cell py-1 md:py-2">
              <span className="font-bold md:hidden">Date: </span>
              {new Date(lead.created_at).toLocaleDateString()}
            </td>
            <td className="md:table-cell py-1 md:py-2">
              <span className="font-bold md:hidden">Caller: </span>
              {lead.caller_number}
              <VerificationBadge lead={lead} />
              {lead.is_duplicate && (
                <span
                  className="ml-2 inline-block rounded-full bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5"
                  title="Another lead in your pipeline shares this same phone number"
                >
                  Possible duplicate
                </span>
              )}
              <TagList lead={lead} onTagsUpdate={onTagsUpdate} />
            </td>
            <td className="md:table-cell py-1 md:py-2">
              <span className="font-bold md:hidden">Status: </span>
              <select value={lead.status} onChange={(e) => onStatusUpdate(lead.id, e.target.value)}>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
            </td>
            <td className="md:table-cell py-1 md:py-2">
              <span className="font-bold md:hidden">Recording: </span>
              {lead.recording_url ? (
                <audio controls preload="none" style={{ height: '32px', maxWidth: '220px' }}>
                  <source src={`/api/leads/${lead.id}/recording`} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              ) : (
                'Pending'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
