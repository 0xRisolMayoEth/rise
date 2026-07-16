'use strict';

/**
 * Mock price source — no network required.
 *
 * Produces a deterministic-ish quote per ticker so the tracker can be run and
 * demonstrated locally. Each call nudges the price with a small random walk
 * and remembers the running day-high/low per ticker.
 *
 * A quote is { last: number, high: number, low: number }.
 * fetchHistory() returns synthetic daily candles for agent-pipeline dry runs.
 */
const state = new Map(); // ticker -> { last, high, low }

/** Stable-ish base price derived from the ticker characters. */
function basePrice(ticker) {
  return 100 + ([...ticker].reduce((a, c) => a + c.charCodeAt(0), 0) % 900);
}

/**
 * Seed a starting price for a ticker (optional; otherwise derived).
 * @param {string} ticker
 * @param {number} price
 */
function seed(ticker, price) {
  state.set(ticker, { last: price, high: price, low: price });
}

/**
 * @param {string} ticker
 * @returns {Promise<{last: number, high: number, low: number}>}
 */
async function fetchPrice(ticker) {
  let s = state.get(ticker);
  if (!s) {
    const base = basePrice(ticker);
    s = { last: base, high: base, low: base };
  }

  // Random walk: ±2%.
  const drift = 1 + (Math.random() - 0.4) * 0.04;
  const last = Math.max(1, Math.round(s.last * drift));
  const high = Math.max(s.high, last);
  const low = Math.min(s.low ?? last, last);

  s = { last, high, low };
  state.set(ticker, s);
  return { ...s };
}

/**
 * Synthetic daily OHLCV history: a gentle uptrend with a volume spike on the
 * final day, so scanner/technical filters have something to pass in dev.
 * @param {string} ticker
 * @param {string} [range='3mo']
 */
async function fetchHistory(ticker, range = '3mo') {
  const days = range === '1mo' ? 22 : range === '6mo' ? 130 : 65;
  const base = basePrice(ticker);
  const daySec = 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);

  const candles = [];
  let close = base;
  for (let i = 0; i < days; i += 1) {
    // Deterministic wobble + mild uptrend.
    const wobble = Math.sin(i / 3) * 0.01 + 0.002;
    close = Math.max(1, Math.round(close * (1 + wobble)));
    const open = Math.round(close * 0.995);
    candles.push({
      time: now - (days - i) * daySec,
      open,
      high: Math.round(close * 1.01),
      low: Math.round(open * 0.99),
      close,
      volume: 1_000_000 * (i === days - 1 ? 3 : 1),
    });
  }
  return candles;
}

/**
 * Synthetic IHSG history for the regime filter: a steady uptrend, so the
 * dev pipeline is never blocked by the market gate.
 * @param {string} [range='3mo']
 */
async function fetchIndexHistory(range = '3mo') {
  return fetchHistory('IHSG', range);
}

module.exports = { fetchPrice, fetchHistory, fetchIndexHistory, seed, _state: state };
