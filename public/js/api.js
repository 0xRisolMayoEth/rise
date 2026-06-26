// Thin fetch wrapper around the RISE backend API.

async function get(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function qs(params) {
  const entries = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
}

export const api = {
  health: () => get('/api/health'),
  signals: (params) => get('/api/signals' + qs(params)),
  signal: (id) => get(`/api/signals/${id}`),
  updates: (id) => get(`/api/signals/${id}/updates`),
  stats: () => get('/api/stats'),
  calendar: (month) => get('/api/calendar' + qs({ month })),
};
