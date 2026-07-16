'use strict';

/**
 * Agent 1 — Market Scanner.
 *
 * Walks the whole ticker universe, pulls daily OHLCV history per ticker, and
 * applies coarse liquidity/price filters. The survivors (with their candles)
 * go to the Technical Analyst for scoring.
 *
 * Filters (all from config.agents):
 *   - minimum last close (avoid "gocap" / illiquid penny names);
 *   - minimum median daily transaction value over the last 20 days;
 *   - last-day volume spike vs the 20-day average.
 */
const fs = require('fs');
const config = require('../config');
const { sleep } = require('../utils/retry');
const { createLogger } = require('../utils/logger');

const log = createLogger('agents');

/** Load the ticker universe from the configured JSON file. */
function loadUniverse(filePath = config.agents.universePath) {
  const { tickers } = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(tickers) || tickers.length === 0) {
    throw new Error(`universe file has no tickers: ${filePath}`);
  }
  return tickers;
}

/** Median of a numeric array. */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Apply the scanner filters to one ticker's candles.
 * Pure function — easy to test with fixtures.
 *
 * @param {Array<{close:number, volume:number}>} candles  Oldest first.
 * @param {object} [filters]
 * @returns {{pass: boolean, reason?: string}}
 */
function passesFilters(candles, filters = config.agents) {
  if (!Array.isArray(candles) || candles.length < 30) {
    return { pass: false, reason: 'histori terlalu pendek' };
  }
  const last = candles[candles.length - 1];

  if (last.close < filters.minPrice) {
    return { pass: false, reason: `harga ${last.close} < min ${filters.minPrice}` };
  }

  const recent = candles.slice(-20);
  const medianValue = median(recent.map((c) => c.close * c.volume));
  if (medianValue < filters.minValue) {
    return { pass: false, reason: 'nilai transaksi median terlalu kecil' };
  }

  const avgVolume = recent.reduce((a, c) => a + c.volume, 0) / recent.length;
  if (avgVolume <= 0 || last.volume < avgVolume * filters.volumeSpike) {
    return { pass: false, reason: 'tidak ada volume spike' };
  }

  return { pass: true };
}

/**
 * Scan the universe: fetch history per ticker and keep those passing filters.
 * Fetch failures are logged and skipped — one bad ticker never kills a scan.
 *
 * @param {object} deps
 * @param {(ticker:string, range?:string)=>Promise<object[]>} deps.fetchHistory
 * @param {string[]} [deps.universe]
 * @param {number} [deps.fetchDelayMs]
 * @returns {Promise<{scanned:number, shortlist:Array<{ticker:string, candles:object[]}>}>}
 */
async function scan(deps) {
  const {
    fetchHistory,
    universe = loadUniverse(),
    fetchDelayMs = config.agents.fetchDelayMs,
  } = deps;

  const shortlist = [];
  for (let i = 0; i < universe.length; i += 1) {
    if (i > 0 && fetchDelayMs > 0) await sleep(fetchDelayMs);
    const ticker = universe[i];
    try {
      const candles = await fetchHistory(ticker, config.agents.historyRange);
      const check = passesFilters(candles);
      if (check.pass) shortlist.push({ ticker, candles });
      else log.debug(`${ticker} gugur: ${check.reason}`);
    } catch (e) {
      log.warn(`scan gagal untuk ${ticker}`, { error: e.message });
    }
  }

  log.info(`scan selesai: ${universe.length} discan, ${shortlist.length} lolos filter`);
  return { scanned: universe.length, shortlist };
}

module.exports = { scan, passesFilters, loadUniverse, median };
