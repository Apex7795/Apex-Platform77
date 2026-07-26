// components/LeadsKanban.jsx
// Drag-and-drop board view of the same leads LeadsTable shows as rows.
// Native HTML5 drag-and-drop (draggable + dragstart/dragover/drop) --
// no extra dependency for something this small.
'use client';

import { useState } from 'react';

const COLUMNS = [
  { status: 'new', label: 'New' },
  { status: 'contacted', label: 'Contacted' },
  { status: 'won', label: 'Won' },
  { status: 'lost', label: 'Lost' },
];

function LeadCard({ lead, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      className="bg-white border border-slate-200 rounded-lg p-3 mb-2 shadow-sm cursor-grab active:cursor-grabbing text-sm"
    >
      <p className="font-medium truncate">{lead.caller_number}</p>
      <p className="text-xs text-slate-500">{new Date(lead.created_at).toLocaleDateString()}</p>
      {lead.is_duplicate && (
        <span className="inline-block mt-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium px-2 py-0.5">
          Possible duplicate
        </span>
      )}
      {lead.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {lead.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeadsKanban({ leads, onStatusUpdate }) {
  const [dragOverStatus, setDragOverStatus] = useState(null);

  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDrop = (e, status) => {
    e.preventDefault();
    setDragOverStatus(null);
    const leadId = e.dataTransfer.getData('text/plain');
    if (leadId) onStatusUpdate(leadId, status);
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {COLUMNS.map((col) => {
        const columnLeads = leads.filter((l) => l.status === col.status);
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(col.status);
            }}
            onDragLeave={() => setDragOverStatus(null)}
            onDrop={(e) => handleDrop(e, col.status)}
            className={`rounded-lg p-2 min-h-[200px] ${
              dragOverStatus === col.status ? 'bg-red-50 border-2 border-red-300' : 'bg-slate-50 border-2 border-transparent'
            }`}
          >
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2 px-1">
              {col.label} <span className="text-slate-400">({columnLeads.length})</span>
            </p>
            {columnLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} onDragStart={handleDragStart} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
