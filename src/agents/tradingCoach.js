'use strict';

/**
 * Agent 7 — Trading Coach.
 *
 * Mengevaluasi hasil trading terhadap aturan sederhana dan menghasilkan saran
 * teks (digabung ke recap harian). Rule-based:
 *   - streak CUT LOSS beruntun per tipe -> perketat filter / naikkan minScore;
 *   - win rate rendah dengan sampel cukup -> evaluasi kriteria entry;
 *   - profit factor < 1 dengan sampel cukup -> sistem sedang rugi bersih.
 */
const config = require('../config');
const { getDb } = require('../database/db');

/** Closed agent signals of a type, newest first. */
function recentClosed(type, limit = 10) {
  return getDb()
    .prepare(
      `SELECT status, profit_pct FROM signals
        WHERE type = ? AND source = 'agent'
          AND status IN ('TP1 HIT','DONE','CUT LOSS')
        ORDER BY closed_at DESC, id DESC LIMIT ?`
    )
    .all(type, limit);
}

/**
 * Evaluate the rules against current performance.
 *
 * @param {object} performance   Result of stats.getPerformance().
 * @param {object} [cfg]         config.agents override (tests).
 * @param {(type:string, limit?:number)=>object[]} [fetchClosed]  Injected for tests.
 * @returns {string[]} advice lines (empty when everything looks healthy).
 */
function advise(performance, cfg = config.agents, fetchClosed = recentClosed) {
  const advice = [];

  for (const type of Object.keys(cfg.types)) {
    const rows = fetchClosed(type, 10);
    let streak = 0;
    for (const r of rows) {
      if (r.status === 'CUT LOSS') streak += 1;
      else break;
    }
    if (streak >= 3) {
      advice.push(
        `${type}: ${streak} CUT LOSS beruntun — pertimbangkan menaikkan AGENT_MIN_SCORE ` +
          `(sekarang ${cfg.minScore}) atau perketat filter scanner.`
      );
    }
  }

  const overall = performance && performance.overall;
  if (overall && overall.closed >= 10) {
    if (overall.winRate < 50) {
      advice.push(
        `Win rate ${overall.winRate}% di bawah 50% (${overall.closed} sinyal) — evaluasi kriteria entry.`
      );
    }
    if (overall.profitFactor < 1) {
      advice.push(
        `Profit factor ${overall.profitFactor} < 1 — sistem rugi bersih; kurangi ukuran posisi sampai membaik.`
      );
    }
  }

  return advice;
}

module.exports = { advise, recentClosed };
