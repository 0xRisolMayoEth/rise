// Client-side mirror of src/utils/format.js — renders the canonical ASCII
// signal block so cards look identical to Discord/Telegram.

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

// Parse the API's "YYYY-MM-DD HH:MM:SS" (WIB localtime) into a Date whose
// UTC fields equal the WIB wall-clock, so formatWIB prints it back unchanged.
export function parseDbTime(s) {
  if (!s) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return new Date(s);
  const [, y, mo, d, h, mi, se] = m.map(Number);
  // Build as UTC then subtract the +7 offset that formatWIB will re-add.
  return new Date(Date.UTC(y, mo - 1, d, h, mi, se) - 7 * 3600 * 1000);
}

export function formatWIB(date = new Date()) {
  const wib = new Date(date.getTime() + 7 * 3600 * 1000);
  const dd = wib.getUTCDate();
  const mon = MONTHS[wib.getUTCMonth()];
  const yyyy = wib.getUTCFullYear();
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${dd} ${mon} ${yyyy} • ${hh}:${mm} WIB`;
}

function val(v) {
  return v === null || v === undefined || v === '' ? '-' : String(v);
}

// Build the plain ASCII block (no code fence).
export function formatSignal(s, date) {
  const when = date || parseDbTime(s.updated_at || s.created_at);
  const header = s.status === 'RUNNING' ? 'NEW SIGNAL' : s.status;
  const entries = `${val(s.entry1)} | ${val(s.entry2)} | ${val(s.entry3)}`;
  const tpLine = s.status === 'RUNNING' ? val(s.tp) : `${val(s.tp)} ✓`;

  const lines = [
    `● ${header}`,
    `┌ ${s.ticker} – ${s.type}`,
    `├ Entry  : ${entries}`,
    `├ AVG    : ${val(s.avg)}`,
    `├ TP     : ${tpLine}`,
  ];

  if (s.status !== 'RUNNING') {
    if (s.high !== null && s.high !== undefined) lines.push(`├ High   : ${val(s.high)}`);
    if (s.profit_pct !== null && s.profit_pct !== undefined) {
      const sign = Number(s.profit_pct) >= 0 ? '+' : '';
      lines.push(`├ Profit : ${sign}${Number(s.profit_pct).toFixed(2)}%`);
    }
  }

  lines.push(`├ Status : ${s.status}`);
  lines.push(`└ ${formatWIB(when)}`);
  return lines.join('\n');
}

// CSS modifier suffix for a status.
export function statusClass(status) {
  if (status === 'RUNNING') return 's-running';
  if (status === 'TP1 HIT') return 's-tp1';
  return 's-done';
}
