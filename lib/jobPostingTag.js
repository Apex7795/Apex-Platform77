// lib/jobPostingTag.js
// Short, human-readable reference for a cross-tenant job posting -- e.g.
// "SAC-4821" -- so two tenants on the phone can say "job SAC-4821"
// instead of reading a UUID to each other. Not cryptographically
// meaningful, just a friendly label; job_postings.id (a UUID) is what
// every foreign key and permission check actually uses.
function generateJobTag(city) {
  const prefix = (city || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'JOB';
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${digits}`;
}

module.exports = { generateJobTag };
