'use strict';

/**
 * Agent 6 — Performance Analyst.
 *
 * Membaca metrik dari tabel signals (via models/stats.getPerformance) dan
 * merangkainya menjadi recap teks untuk channel admin: win rate, profit
 * factor, max drawdown, per tipe dan keseluruhan.
 */
const { getPerformance } = require('../models/stats');

/** Format one metrics row as a compact line. */
function line(label, m) {
  if (!m.closed) return `${label}: belum ada sinyal closed`;
  const pf = m.profitFactor === Infinity ? '∞' : m.profitFactor;
  return (
    `${label}: ${m.closed} closed · WR ${m.winRate}% · PF ${pf} · ` +
    `avg ${m.avgProfit >= 0 ? '+' : ''}${m.avgProfit}% · DD ${m.maxDrawdown}% · ` +
    `cut loss ${m.cutLosses}`
  );
}

/**
 * Build the daily recap text.
 * @param {object} [opts]  Forwarded to getPerformance ({source, days}).
 * @returns {{text:string, performance:object}}
 */
function recap(opts = {}) {
  const perf = getPerformance(opts);
  const lines = [
    'REKAP PERFORMA' + (opts.days ? ` (${opts.days} hari terakhir)` : ''),
    line('Total', perf.overall),
  ];
  for (const [type, m] of Object.entries(perf.byType)) {
    if (m.closed) lines.push(line(type, m));
  }
  return { text: lines.join('\n'), performance: perf };
}

module.exports = { recap, line };
