'use strict';

const { getDb } = require('../database/db');

/**
 * Analytics queries backing the dashboard / statistics / calendar views.
 */

const STATUSES = ['RUNNING', 'TP1 HIT', 'DONE'];
const TYPES = ['HAKA PREOPEN', 'SNIPER', 'BSJP', 'SWING'];

/**
 * Aggregate counts grouped by a column, returned as a complete map so every
 * known key is present (zero-filled) regardless of what's in the table.
 * @param {string} column
 * @param {string[]} keys
 * @returns {Record<string, number>}
 */
function countsBy(column, keys) {
  const rows = getDb()
    .prepare(`SELECT ${column} AS k, COUNT(*) AS n FROM signals GROUP BY ${column}`)
    .all();
  const map = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) {
    if (r.k in map) map[r.k] = r.n;
    else map[r.k] = r.n; // tolerate unexpected values
  }
  return map;
}

/**
 * Overall statistics for the dashboard:
 *   - total signals
 *   - counts by status and by type
 *   - closed count, win count, win rate, average profit
 *   - best / worst signal by profit %
 * @returns {object}
 */
function getStats() {
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) AS n FROM signals').get().n;
  const byStatus = countsBy('status', STATUSES);
  const byType = countsBy('type', TYPES);

  // A signal is "closed" once it leaves RUNNING.
  const closedFilter = "status IN ('TP1 HIT','DONE')";
  const closed = db
    .prepare(`SELECT COUNT(*) AS n FROM signals WHERE ${closedFilter}`)
    .get().n;
  const wins = db
    .prepare(
      `SELECT COUNT(*) AS n FROM signals WHERE ${closedFilter} AND profit_pct >= 0`
    )
    .get().n;
  const avgProfit = db
    .prepare(
      `SELECT AVG(profit_pct) AS a FROM signals WHERE ${closedFilter} AND profit_pct IS NOT NULL`
    )
    .get().a;

  const best = db
    .prepare(
      `SELECT * FROM signals WHERE profit_pct IS NOT NULL ORDER BY profit_pct DESC LIMIT 1`
    )
    .get();
  const worst = db
    .prepare(
      `SELECT * FROM signals WHERE profit_pct IS NOT NULL ORDER BY profit_pct ASC LIMIT 1`
    )
    .get();

  return {
    total,
    byStatus,
    byType,
    closed,
    wins,
    winRate: closed ? Math.round((wins / closed) * 10000) / 100 : 0,
    avgProfit: avgProfit !== null ? Math.round(avgProfit * 100) / 100 : 0,
    best: best || null,
    worst: worst || null,
  };
}

/**
 * Calendar data for a month: the number of signals created on each day.
 * @param {number} year   e.g. 2026
 * @param {number} month  1-12
 * @returns {{ year: number, month: number, days: Record<string, number> }}
 */
function getCalendar(year, month) {
  const mm = String(month).padStart(2, '0');
  const prefix = `${year}-${mm}`; // matches created_at "YYYY-MM-DD HH:MM:SS"

  const rows = getDb()
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n
         FROM signals
        WHERE substr(created_at, 1, 7) = ?
        GROUP BY day
        ORDER BY day`
    )
    .all(prefix);

  const days = {};
  for (const r of rows) days[r.day] = r.n;
  return { year, month, days };
}

module.exports = { getStats, getCalendar, STATUSES, TYPES };
