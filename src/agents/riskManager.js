'use strict';

/**
 * Agent 3 — Risk Manager.
 *
 * Turns a scored candidate + live price into a trade plan:
 *   - entry ladder (entry1 = harga live; entry2/3 dari support di bawahnya);
 *   - TP/SL dari persentase per tipe (config.agents.types), dihitung dari
 *     AVG entry dan dibulatkan ke fraksi harga (tick) IDX;
 *   - ukuran posisi dari alokasi modal Portfolio Manager;
 *   - risk/reward ratio.
 *
 * HAKA PREOPEN pakai satu entry saja (beli di open); BSJP/SWING pakai ladder.
 */
const config = require('../config');
const { computeAvg } = require('../models/signal');

/**
 * IDX price fraction (tick size) for a given price level.
 * @param {number} price
 * @returns {number}
 */
function tickSize(price) {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

/**
 * Round a price to a valid IDX tick. Direction: 'down' (default, entries/SL)
 * or 'up' — TP is rounded down too so the target stays reachable.
 * @param {number} price
 * @param {'down'|'up'|'nearest'} [dir='down']
 * @returns {number}
 */
function roundToTick(price, dir = 'down') {
  const tick = tickSize(price);
  const ratio = price / tick;
  const ticks = dir === 'up' ? Math.ceil(ratio) : dir === 'nearest' ? Math.round(ratio) : Math.floor(ratio);
  return Math.max(tick, ticks * tick);
}

/**
 * Build the trade plan for one candidate.
 *
 * @param {object} input
 * @param {string} input.type        Canonical signal type.
 * @param {number} input.last        Live price (entry basis).
 * @param {number|null} [input.support1]
 * @param {number|null} [input.support2]
 * @param {object} [input.cfg]       config.agents override (tests).
 * @returns {{entry1:number, entry2:number|null, entry3:number|null, avg:number,
 *            tp:number, sl:number, lots:number, budget:number, riskReward:number}|null}
 *   null when the type has no TP/SL config or the price is invalid.
 */
function buildPlan(input) {
  const cfg = input.cfg || config.agents;
  const pct = cfg.types[input.type];
  const last = Number(input.last);
  if (!pct || !Number.isFinite(last) || last <= 0) return null;

  const entry1 = roundToTick(last, 'nearest');

  // Ladder entries below the live price, anchored on supports when they sit
  // beneath it; otherwise fall back to fixed steps down. HAKA buys the open
  // price only — no ladder.
  let entry2 = null;
  let entry3 = null;
  if (input.type !== 'HAKA PREOPEN') {
    const below = (level, ref) =>
      level !== null && level !== undefined && level > 0 && level < ref ? level : null;
    entry2 = roundToTick(below(input.support1, entry1) ?? entry1 * 0.98);
    entry3 = roundToTick(below(input.support2, entry2) ?? entry2 * 0.97);
  }

  const avg = computeAvg([entry1, entry2, entry3]);
  const tp = roundToTick(avg * (1 + pct.tp / 100), 'down');
  const sl = roundToTick(avg * (1 - pct.sl / 100), 'down');
  if (tp <= 0 || sl <= 0 || tp <= sl) return null;

  // Position sizing: budget = % modal; IDX lot = 100 lembar.
  const budget = (cfg.capital * cfg.maxPositionPct) / 100;
  const lots = Math.floor(budget / (entry1 * 100));

  const risk = avg - sl;
  const riskReward = risk > 0 ? Math.round(((tp - avg) / risk) * 100) / 100 : null;

  return { entry1, entry2, entry3, avg, tp, sl, lots, budget, riskReward };
}

module.exports = { buildPlan, tickSize, roundToTick };
