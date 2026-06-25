'use strict';

/**
 * Mock price source — no network required.
 *
 * Produces a deterministic-ish quote per ticker so the tracker can be run and
 * demonstrated locally. Each call nudges the price with a small random walk
 * and remembers the running day-high per ticker.
 *
 * A quote is { last: number, high: number }.
 */
const state = new Map(); // ticker -> { last, high }

/**
 * Seed a starting price for a ticker (optional; otherwise derived).
 * @param {string} ticker
 * @param {number} price
 */
function seed(ticker, price) {
  state.set(ticker, { last: price, high: price });
}

/**
 * @param {string} ticker
 * @returns {Promise<{last: number, high: number}>}
 */
async function fetchPrice(ticker) {
  let s = state.get(ticker);
  if (!s) {
    // Derive a stable-ish base price from the ticker characters.
    const base =
      100 +
      ([...ticker].reduce((a, c) => a + c.charCodeAt(0), 0) % 900);
    s = { last: base, high: base };
  }

  // Random walk: ±2%.
  const drift = 1 + (Math.random() - 0.4) * 0.04;
  const last = Math.max(1, Math.round(s.last * drift));
  const high = Math.max(s.high, last);

  s = { last, high };
  state.set(ticker, s);
  return { ...s };
}

module.exports = { fetchPrice, seed, _state: state };
