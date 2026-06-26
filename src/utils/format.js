'use strict';

/**
 * Signal formatting helpers.
 *
 * Produces the exact ASCII layout defined in CLAUDE.md, identical across
 * Discord and Telegram. No emoji or decoration — just the box-drawing lines.
 *
 *   ● NEW SIGNAL
 *   ┌ SCMA – BSJP
 *   ├ Entry  : 214 | 200 | 190
 *   ├ AVG    : 200
 *   ├ TP     : 222
 *   ├ Status : RUNNING
 *   └ 24 Jun 2026 • 15:12 WIB
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/**
 * Format a Date into "24 Jun 2026 • 15:12 WIB" in WIB (UTC+7),
 * independent of the host machine's timezone.
 * @param {Date} [date]
 * @returns {string}
 */
function formatWIB(date = new Date()) {
  // Shift to UTC+7 by working off the UTC epoch.
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const dd = wib.getUTCDate();
  const mon = MONTHS[wib.getUTCMonth()];
  const yyyy = wib.getUTCFullYear();
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${dd} ${mon} ${yyyy} • ${hh}:${mm} WIB`;
}

/**
 * Render a single entry value, using "-" for missing values.
 * @param {number|null|undefined} v
 */
function entryVal(v) {
  return v === null || v === undefined || v === '' ? '-' : trimNum(v);
}

/**
 * Drop trailing ".0" style decimals so 200.0 prints as "200".
 * @param {number} v
 */
function trimNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return Number.isInteger(n) ? String(n) : String(n);
}

/**
 * Build the formatted signal block.
 *
 * @param {object} s              Signal row (or signal-like object).
 * @param {string} s.ticker
 * @param {string} s.type         Canonical DB type, e.g. "HAKA PREOPEN".
 * @param {number} [s.entry1]
 * @param {number} [s.entry2]
 * @param {number} [s.entry3]
 * @param {number} [s.avg]
 * @param {number} s.tp
 * @param {string} s.status       RUNNING | TP1 HIT | DONE
 * @param {number} [s.high]
 * @param {number} [s.profit_pct]
 * @param {Date}   [date]         Timestamp for the footer line.
 * @returns {string} plain text (wrap in a code block for Discord/Telegram).
 */
function formatSignal(s, date = new Date()) {
  const header =
    s.status === 'RUNNING' ? 'NEW SIGNAL' : s.status; // "TP1 HIT" / "DONE"

  const entries = `${entryVal(s.entry1)} | ${entryVal(s.entry2)} | ${entryVal(s.entry3)}`;
  const tpLine = s.status === 'RUNNING' ? trimNum(s.tp) : `${trimNum(s.tp)} ✓`;

  const lines = [
    `● ${header}`,
    `┌ ${s.ticker} – ${s.type}`,
    `├ Entry  : ${entries}`,
    `├ AVG    : ${entryVal(s.avg)}`,
    `├ TP     : ${tpLine}`,
  ];

  // High and Profit only appear once the signal has moved past RUNNING.
  if (s.status !== 'RUNNING') {
    if (s.high !== null && s.high !== undefined) {
      lines.push(`├ High   : ${trimNum(s.high)}`);
    }
    if (s.profit_pct !== null && s.profit_pct !== undefined) {
      const sign = Number(s.profit_pct) >= 0 ? '+' : '';
      lines.push(`├ Profit : ${sign}${Number(s.profit_pct).toFixed(2)}%`);
    }
  }

  lines.push(`├ Status : ${s.status}`);
  lines.push(`└ ${formatWIB(date)}`);

  return lines.join('\n');
}

/**
 * Format a stored localtime stamp ("YYYY-MM-DD HH:MM:SS", already WIB) into
 * "24 Jun 2026 • 15:12 WIB". Returns "-" when absent/unparseable.
 * @param {string} str
 */
function formatStamp(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(str || ''));
  if (!m) return '-';
  const [, y, mo, d, hh, mm] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y} • ${hh}:${mm} WIB`;
}

/**
 * Take-profit distance from the average entry, as a percentage string
 * (e.g. "+3%"), or "" when not computable.
 * @param {object} s
 */
function tpPercentLabel(s) {
  const avg = Number(s.avg);
  const tp = Number(s.tp);
  if (!Number.isFinite(avg) || !Number.isFinite(tp) || avg <= 0) return '';
  const pct = ((tp - avg) / avg) * 100;
  const r = Math.round(pct * 10) / 10;
  return `${r >= 0 ? '+' : ''}${r}%`;
}

/**
 * DONE announcement for the "information done" channel. Includes the source
 * (signal type), entry and done dates, and realised profit.
 *
 * @param {object} s  A DONE signal row.
 * @returns {string} plain text (wrap in a code block for Discord/Telegram).
 */
function formatDone(s) {
  const entries = `${entryVal(s.entry1)} | ${entryVal(s.entry2)} | ${entryVal(s.entry3)}`;
  const pct = tpPercentLabel(s);
  const lines = [
    `● TARGET DONE`,
    `┌ ${s.ticker} – ${s.type}`,
    `├ Source    : ${s.type}`,
    `├ Entry     : ${entries}`,
    `├ AVG       : ${entryVal(s.avg)}`,
    `├ TP        : ${trimNum(s.tp)} ✓${pct ? ` (${pct})` : ''}`,
  ];
  if (s.high !== null && s.high !== undefined) lines.push(`├ High      : ${trimNum(s.high)}`);
  if (s.profit_pct !== null && s.profit_pct !== undefined) {
    const sign = Number(s.profit_pct) >= 0 ? '+' : '';
    lines.push(`├ Profit    : ${sign}${Number(s.profit_pct).toFixed(2)}%`);
  }
  lines.push(`├ Tgl Entry : ${formatStamp(s.created_at)}`);
  lines.push(`├ Tgl Done  : ${formatStamp(s.closed_at)}`);
  lines.push(`└ Status    : DONE`);
  return lines.join('\n');
}

/**
 * Wrap a formatted block in a Discord/Telegram monospace code block.
 * @param {string} text
 */
function asCodeBlock(text) {
  return '```\n' + text + '\n```';
}

module.exports = { formatSignal, formatDone, formatWIB, formatStamp, tpPercentLabel, asCodeBlock };
