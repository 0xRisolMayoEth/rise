'use strict';

const { getDb } = require('../database/db');

/**
 * Data-access helpers for `agent_candidates` — the daily scan results the
 * agent pipeline's type runs (HAKA/BSJP/SWING) read from.
 */

/**
 * Replace the candidate set for a scan date (idempotent per day).
 *
 * @param {string} scanDate  YYYY-MM-DD (WIB).
 * @param {Array<{ticker:string, score:number, last:number,
 *                support1?:number, support2?:number, resistance?:number,
 *                metrics?:object}>} list
 */
function saveCandidates(scanDate, list) {
  const db = getDb();
  const del = db.prepare('DELETE FROM agent_candidates WHERE scan_date = ?');
  const ins = db.prepare(`
    INSERT INTO agent_candidates (scan_date, ticker, score, last, support1, support2, resistance, metrics)
    VALUES (@scan_date, @ticker, @score, @last, @support1, @support2, @resistance, @metrics)
  `);

  db.transaction(() => {
    del.run(scanDate);
    for (const c of list) {
      ins.run({
        scan_date: scanDate,
        ticker: c.ticker,
        score: c.score,
        last: c.last ?? null,
        support1: c.support1 ?? null,
        support2: c.support2 ?? null,
        resistance: c.resistance ?? null,
        metrics: c.metrics ? JSON.stringify(c.metrics) : null,
      });
    }
  })();
}

/**
 * Candidates for a scan date, best score first. `metrics` comes back parsed.
 * @param {string} scanDate  YYYY-MM-DD (WIB).
 * @returns {object[]}
 */
function listCandidates(scanDate) {
  return getDb()
    .prepare(
      'SELECT * FROM agent_candidates WHERE scan_date = ? ORDER BY score DESC, ticker ASC'
    )
    .all(scanDate)
    .map((row) => ({
      ...row,
      metrics: row.metrics ? JSON.parse(row.metrics) : null,
    }));
}

module.exports = { saveCandidates, listCandidates };
