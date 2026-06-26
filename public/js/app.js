import { api } from './api.js';
import { formatSignal, statusClass, parseDbTime } from './format.js';

const appEl = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
const connEl = document.getElementById('conn');

const TYPES = ['HAKA PREOPEN', 'SNIPER', 'BSJP', 'SWING'];
const STATUS_COLORS = { RUNNING: '#3fb950', 'TP1 HIT': '#d29922', DONE: '#58a6ff' };

/* ── helpers ─────────────────────────────────────────────── */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const fmtPct = (v) =>
  v === null || v === undefined ? '—' : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`;

const pctClass = (v) =>
  v === null || v === undefined ? '' : Number(v) >= 0 ? 'profit-pos' : 'profit-neg';

const loading = () => { appEl.innerHTML = '<div class="loading">Memuat…</div>'; };
const errorBox = (msg) => `<div class="empty-state">Gagal memuat data: ${esc(msg)}</div>`;

function signalCard(s) {
  return `<div class="signal ${statusClass(s.status)}"><pre>${esc(formatSignal(s))}</pre></div>`;
}

function dayLabel(s) {
  const d = parseDbTime(s.closed_at || s.updated_at || s.created_at);
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${String(wib.getUTCDate()).padStart(2, '0')}/${String(
    wib.getUTCMonth() + 1
  ).padStart(2, '0')}/${wib.getUTCFullYear()}`;
}

/* ── Dashboard ───────────────────────────────────────────── */
async function viewDashboard() {
  loading();
  const [stats, running] = await Promise.all([
    api.stats(),
    api.signals({ status: 'RUNNING', limit: 6 }),
  ]);

  const stat = (label, value, cls = '') =>
    `<div class="stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;

  const typeCards = TYPES.map(
    (t) =>
      `<div class="stat"><div class="label">${esc(t)}</div><div class="value">${
        stats.byType[t] || 0
      }</div></div>`
  ).join('');

  const live = running.data.length
    ? `<div class="grid cards">${running.data.map(signalCard).join('')}</div>`
    : '<div class="empty-state">Belum ada signal RUNNING.</div>';

  appEl.innerHTML = `
    <h1 class="view-title">Dashboard</h1>
    <div class="grid stats-grid">
      ${stat('Total Signal', stats.total)}
      ${stat('Running', stats.byStatus.RUNNING || 0)}
      ${stat('Win Rate', stats.closed ? stats.winRate + '%' : '—')}
      ${stat('Avg Profit', fmtPct(stats.avgProfit), stats.avgProfit >= 0 ? 'pos' : 'neg')}
    </div>
    <div class="section">
      <h2>Summary per Tipe</h2>
      <div class="grid types-grid">${typeCards}</div>
    </div>
    <div class="section">
      <h2>Live Signals</h2>
      ${live}
    </div>`;
}

/* ── Live Signals ────────────────────────────────────────── */
let liveFilter = 'ALL';
async function viewLive() {
  loading();
  const res = await api.signals({ status: 'RUNNING', limit: 100 });
  const all = res.data;

  const chips = ['ALL', ...TYPES]
    .map(
      (t) =>
        `<div class="chip ${liveFilter === t ? 'active' : ''}" data-type="${esc(t)}">${
          t === 'ALL' ? 'Semua' : esc(t)
        }</div>`
    )
    .join('');

  const filtered = liveFilter === 'ALL' ? all : all.filter((s) => s.type === liveFilter);
  const body = filtered.length
    ? `<div class="grid cards">${filtered.map(signalCard).join('')}</div>`
    : '<div class="empty-state">Tidak ada signal untuk filter ini.</div>';

  appEl.innerHTML = `
    <h1 class="view-title">Live Signals</h1>
    <div class="filters">${chips}</div>
    ${body}`;

  appEl.querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => {
      liveFilter = c.dataset.type;
      viewLive();
    })
  );
}

/* ── History ─────────────────────────────────────────────── */
async function viewHistory() {
  loading();
  const res = await api.signals({ limit: 200 });
  const rows = res.data.filter((s) => s.status === 'TP1 HIT' || s.status === 'DONE');

  const body = rows.length
    ? rows
        .map(
          (s) => `<tr>
            <td>${esc(s.ticker)}</td>
            <td>${esc(s.type)}</td>
            <td class="num">${s.avg ?? '—'}</td>
            <td class="num">${s.tp}</td>
            <td class="num">${s.high ?? '—'}</td>
            <td class="num ${pctClass(s.profit_pct)}">${fmtPct(s.profit_pct)}</td>
            <td><span class="badge ${statusClass(s.status)}">${esc(s.status)}</span></td>
            <td>${dayLabel(s)}</td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="8" class="empty-state">Belum ada history.</td></tr>';

  appEl.innerHTML = `
    <h1 class="view-title">History</h1>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Ticker</th><th>Tipe</th><th>AVG</th><th>TP</th>
          <th>High</th><th>Profit</th><th>Status</th><th>Tanggal</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

/* ── Statistics ──────────────────────────────────────────── */
function donut(byStatus) {
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  const segs = Object.entries(byStatus)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => {
      const frac = total ? n / total : 0;
      const seg = `<circle r="${r}" cx="70" cy="70" fill="none"
        stroke="${STATUS_COLORS[status]}" stroke-width="16"
        stroke-dasharray="${(frac * c).toFixed(2)} ${c.toFixed(2)}"
        stroke-dashoffset="${(-offset * c).toFixed(2)}"
        transform="rotate(-90 70 70)"></circle>`;
      offset += frac;
      return seg;
    })
    .join('');

  const legend = Object.entries(byStatus)
    .map(
      ([status, n]) =>
        `<div class="row"><span class="dot" style="background:${STATUS_COLORS[status]}"></span>
         ${esc(status)} <span class="muted">· ${n}</span></div>`
    )
    .join('');

  return `<div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap">
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle r="${r}" cx="70" cy="70" fill="none" stroke="#1c222b" stroke-width="16"></circle>
      ${segs}
      <text x="70" y="66" text-anchor="middle" fill="#e6edf3" font-size="22" font-weight="700">${total}</text>
      <text x="70" y="84" text-anchor="middle" fill="#8b949e" font-size="11">signals</text>
    </svg>
    <div class="legend">${legend}</div>
  </div>`;
}

function profitBars(rows) {
  if (!rows.length) return '<div class="empty-state">Belum ada signal dengan profit.</div>';
  const max = Math.max(5, ...rows.map((s) => Math.abs(Number(s.profit_pct) || 0)));
  return `<div class="bars">${rows
    .map((s) => {
      const p = Number(s.profit_pct) || 0;
      const w = (Math.abs(p) / max) * 50; // half-width = 50%
      const fill =
        p >= 0
          ? `<div class="bar-fill pos" style="width:${w}%"></div>`
          : `<div class="bar-fill neg" style="width:${w}%"></div>`;
      return `<div class="bar-row">
        <span>${esc(s.ticker)} <span class="muted">${esc(s.type.split(' ')[0])}</span></span>
        <span class="bar-track"><span class="bar-mid"></span>${fill}</span>
        <span class="bar-val ${pctClass(p)}">${fmtPct(p)}</span>
      </div>`;
    })
    .join('')}</div>`;
}

async function viewStats() {
  loading();
  const [stats, res] = await Promise.all([api.stats(), api.signals({ limit: 200 })]);
  const closed = res.data
    .filter((s) => s.profit_pct !== null && s.profit_pct !== undefined)
    .sort((a, b) => b.profit_pct - a.profit_pct)
    .slice(0, 12);

  const bw = (title, s) =>
    s
      ? `<div class="panel"><h3>${title}</h3>${signalCard(s)}</div>`
      : `<div class="panel"><h3>${title}</h3><div class="empty-state">—</div></div>`;

  appEl.innerHTML = `
    <h1 class="view-title">Statistics</h1>
    <div class="grid stats-grid">
      <div class="stat"><div class="label">Closed</div><div class="value">${stats.closed}</div></div>
      <div class="stat"><div class="label">Wins</div><div class="value">${stats.wins}</div></div>
      <div class="stat"><div class="label">Win Rate</div><div class="value">${
        stats.closed ? stats.winRate + '%' : '—'
      }</div></div>
      <div class="stat"><div class="label">Avg Profit</div><div class="value ${
        stats.avgProfit >= 0 ? 'pos' : 'neg'
      }">${fmtPct(stats.avgProfit)}</div></div>
    </div>
    <div class="chart-row section">
      <div class="panel"><h3>Profit per Signal</h3>${profitBars(closed)}</div>
      <div class="panel"><h3>Distribusi Status</h3>${donut(stats.byStatus)}</div>
    </div>
    <div class="section">
      <h2>Best / Worst</h2>
      <div class="bestworst">
        ${bw('Best', stats.best)}
        ${bw('Worst', stats.worst)}
      </div>
    </div>`;
}

/* ── Calendar ────────────────────────────────────────────── */
let calDate = new Date(); // local; we only use year/month
async function viewCalendar() {
  loading();
  const year = calDate.getFullYear();
  const month = calDate.getMonth() + 1;
  const res = await api.calendar(`${year}-${String(month).padStart(2, '0')}`);
  const days = res.days || {};

  const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1)
  );

  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const dow = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
    .map((d) => `<div class="dow">${d}</div>`)
    .join('');

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const n = days[key] || 0;
    const cls = ['cal-cell'];
    if (n > 0) cls.push('has');
    if (isThisMonth && today.getDate() === d) cls.push('today');
    cells += `<div class="${cls.join(' ')}"><span>${d}</span>${
      n > 0 ? `<span class="count">${n}</span>` : ''
    }</div>`;
  }

  appEl.innerHTML = `
    <h1 class="view-title">Calendar</h1>
    <div class="cal-head">
      <button id="cal-prev" aria-label="Bulan sebelumnya">‹</button>
      <span class="month">${esc(monthName)}</span>
      <button id="cal-next" aria-label="Bulan berikutnya">›</button>
    </div>
    <div class="cal-grid">${dow}${cells}</div>`;

  document.getElementById('cal-prev').onclick = () => {
    calDate = new Date(year, month - 2, 1);
    viewCalendar();
  };
  document.getElementById('cal-next').onclick = () => {
    calDate = new Date(year, month, 1);
    viewCalendar();
  };
}

/* ── Router ──────────────────────────────────────────────── */
const VIEWS = {
  dashboard: viewDashboard,
  live: viewLive,
  history: viewHistory,
  stats: viewStats,
  calendar: viewCalendar,
};

async function route() {
  const name = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  const view = VIEWS[name] || viewDashboard;

  tabsEl.querySelectorAll('a').forEach((a) =>
    a.classList.toggle('active', a.dataset.view === (VIEWS[name] ? name : 'dashboard'))
  );

  try {
    await view();
  } catch (err) {
    appEl.innerHTML = errorBox(err.message);
  }
}

async function checkConn() {
  try {
    await api.health();
    connEl.classList.add('ok');
    connEl.classList.remove('down');
  } catch {
    connEl.classList.add('down');
    connEl.classList.remove('ok');
  }
}

window.addEventListener('hashchange', route);
checkConn();
route();
