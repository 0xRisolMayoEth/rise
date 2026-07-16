'use strict';

/**
 * Agent 5 — Portfolio Manager.
 *
 * Gerbang terakhir sebelum sinyal dibuat: menjaga konsentrasi risiko.
 *   - satu ticker hanya boleh punya satu sinyal RUNNING;
 *   - total posisi terbuka dibatasi maxOpenPositions;
 *   - per run dibatasi maxSignalsPerRun (kandidat skor tertinggi menang);
 *   - alokasi per posisi maxPositionPct dari modal (dihitung Risk Manager).
 */
const config = require('../config');
const { listSignals } = require('../models/signal');

/**
 * Select which candidates may become signals.
 * Candidates must arrive sorted by score (highest first).
 *
 * @param {Array<{ticker:string}>} candidates
 * @param {object} [cfg]   config.agents override (tests).
 * @param {object[]} [openSignals]  Injected for tests; defaults to DB RUNNING rows.
 * @returns {{accepted:object[], rejected:Array<{candidate:object, reason:string}>,
 *            openCount:number, cashPct:number}}
 */
function select(candidates, cfg = config.agents, openSignals = null) {
  const open = openSignals || listSignals({ status: 'RUNNING', limit: 1000 });
  const openTickers = new Set(open.map((s) => s.ticker));

  const accepted = [];
  const rejected = [];
  let slots = Math.max(0, cfg.maxOpenPositions - open.length);

  for (const c of candidates) {
    if (accepted.length >= cfg.maxSignalsPerRun) {
      rejected.push({ candidate: c, reason: 'kuota per run penuh' });
      continue;
    }
    if (slots <= 0) {
      rejected.push({ candidate: c, reason: 'maks posisi terbuka tercapai' });
      continue;
    }
    if (openTickers.has(c.ticker)) {
      rejected.push({ candidate: c, reason: 'sinyal ticker ini masih RUNNING' });
      continue;
    }
    accepted.push(c);
    openTickers.add(c.ticker);
    slots -= 1;
  }

  // Cash proxy: alokasi yang belum terpakai bila tiap posisi memakai
  // maxPositionPct dari modal.
  const used = (open.length + accepted.length) * cfg.maxPositionPct;
  const cashPct = Math.max(0, Math.round((100 - used) * 100) / 100);

  return { accepted, rejected, openCount: open.length + accepted.length, cashPct };
}

module.exports = { select };
