'use strict';

/**
 * Market-regime filter — gerbang kondisi pasar sebelum sinyal dibuat.
 *
 * Momentum breakout di pasar bearish adalah pembunuh win rate terbesar,
 * jadi pipeline hanya boleh membuat sinyal saat IHSG sehat:
 *   - close terakhir di atas EMA20 hariannya, dan
 *   - tidak sedang turun tajam hari itu (default > -1%).
 *
 * assess() murni (dites dengan fixture); check() menarik histori ^JKSE dari
 * source yang dipakai pipeline. Gagal fetch = fail-open (pipeline jalan,
 * dengan warning) — jangan blokir sinyal hanya karena quote index rusak.
 */
const config = require('../config');
const { ema } = require('./indicators');
const { createLogger } = require('../utils/logger');

const log = createLogger('agents');

/**
 * Judge the market from index candles.
 * @param {Array<{close:number}>} candles  Oldest first (daily).
 * @param {object} [cfg]  config.agents.regime override (tests).
 * @returns {{bullish:boolean, reason:string, close:number|null,
 *            ema20:number|null, change1d:number|null}}
 */
function assess(candles, cfg = config.agents.regime) {
  if (!Array.isArray(candles) || candles.length < 21) {
    return { bullish: true, reason: 'data index kurang — gate dilewati', close: null, ema20: null, change1d: null };
  }

  const closes = candles.map((c) => c.close);
  const close = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const ema20 = ema(closes, 20);
  const change1d = prev > 0 ? Math.round(((close - prev) / prev) * 10000) / 100 : 0;

  if (ema20 !== null && close < ema20) {
    return {
      bullish: false,
      reason: `IHSG ${close} di bawah EMA20 (${Math.round(ema20)})`,
      close, ema20, change1d,
    };
  }
  if (change1d <= -Math.abs(cfg.maxDailyDrop)) {
    return {
      bullish: false,
      reason: `IHSG turun ${change1d}% hari ini (batas -${cfg.maxDailyDrop}%)`,
      close, ema20, change1d,
    };
  }
  return { bullish: true, reason: `IHSG sehat (${change1d >= 0 ? '+' : ''}${change1d}%, di atas EMA20)`, close, ema20, change1d };
}

/**
 * Fetch the index and assess it. Fail-open on fetch errors.
 * @param {object} deps
 * @param {(range?:string)=>Promise<object[]>} [deps.fetchIndexHistory]
 * @returns {Promise<ReturnType<typeof assess>>}
 */
async function check(deps = {}) {
  if (!deps.fetchIndexHistory) {
    log.warn('regime filter: fetchIndexHistory tidak tersedia — gate dilewati');
    return { bullish: true, reason: 'source tanpa data index — gate dilewati', close: null, ema20: null, change1d: null };
  }
  try {
    const candles = await deps.fetchIndexHistory('3mo');
    return assess(candles);
  } catch (e) {
    log.warn('regime filter: fetch index gagal — gate dilewati', { error: e.message });
    return { bullish: true, reason: `fetch index gagal (${e.message}) — gate dilewati`, close: null, ema20: null, change1d: null };
  }
}

module.exports = { assess, check };
