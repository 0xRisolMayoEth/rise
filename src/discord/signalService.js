'use strict';

/**
 * Shared signal-creation service used by the admin text/interactive flow.
 *
 * Responsibilities:
 *   - fetch a live price (the "harga waktu open" / current price);
 *   - auto-compute the take-profit at +N% above the average entry;
 *   - persist the signal and broadcast it to the type's Discord channel
 *     (and Telegram) via the shared notifier.
 */
const config = require('../config');
const { createSignal, computeAvg } = require('../models/signal');
const { broadcastSignal } = require('../notifier');
const { getSource } = require('../tracker/sources');

/**
 * Round a take-profit price to a sensible value for IDX (integer rupiah).
 * @param {number} v
 */
function roundTp(v) {
  return Math.round(v);
}

/**
 * Fetch the current/open price for a ticker from the configured price source.
 * @param {string} ticker
 * @returns {Promise<number>} the last price.
 */
async function fetchPrice(ticker) {
  const { last } = await getSource().fetchPrice(ticker);
  if (!Number.isFinite(last) || last <= 0) {
    throw new Error(`harga tidak valid untuk ${ticker}`);
  }
  return last;
}

/**
 * Compute the auto take-profit from an average entry.
 * @param {number} avg
 * @param {number} [pct=config.signal.tpPercent]
 */
function autoTp(avg, pct = config.signal.tpPercent) {
  return roundTp(avg * (1 + pct / 100));
}

/**
 * Create a signal and broadcast it.
 *
 * @param {object} input
 * @param {string} input.type               Canonical DB type.
 * @param {string} input.ticker
 * @param {Array<number|null>} input.entries Up to 3 entry prices.
 * @param {number} [input.tp]               Explicit TP; auto +N% when omitted.
 * @returns {Promise<{signal: object, tpPercent: number|null}>}
 */
async function createAndBroadcast(input) {
  const entries = (input.entries || []).slice(0, 3);
  const [entry1 = null, entry2 = null, entry3 = null] = entries;
  const avg = computeAvg([entry1, entry2, entry3]);
  if (avg === null) throw new Error('butuh minimal satu harga entry');

  const tp = input.tp != null ? input.tp : autoTp(avg);
  const tpPercent = input.tp != null ? null : config.signal.tpPercent;

  const signal = createSignal({
    ticker: input.ticker,
    type: input.type,
    entry1,
    entry2,
    entry3,
    tp,
  });

  await broadcastSignal(signal, { discord: true, telegram: true });
  return { signal, tpPercent };
}

/**
 * Create a signal using the live price as the single entry (HAKA / "harga
 * saat ini"), with an auto TP.
 *
 * @param {object} input
 * @param {string} input.type
 * @param {string} input.ticker
 * @returns {Promise<{signal: object, tpPercent: number}>}
 */
async function createFromLivePrice(input) {
  const price = await fetchPrice(input.ticker);
  return createAndBroadcast({ type: input.type, ticker: input.ticker, entries: [price] });
}

module.exports = { createAndBroadcast, createFromLivePrice, fetchPrice, autoTp };
