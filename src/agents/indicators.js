'use strict';

/**
 * Technical indicators — pure functions over arrays of numbers (oldest first).
 * No I/O, no state: everything here is unit-testable in isolation.
 */

/**
 * Simple moving average of the last `period` values.
 * @param {number[]} values
 * @param {number} period
 * @returns {number|null} null when there is not enough data.
 */
function sma(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Exponential moving average series. Seeded with the SMA of the first
 * `period` values (standard convention), so the series starts at index
 * `period - 1` of the input.
 * @param {number[]} values
 * @param {number} period
 * @returns {number[]} EMA values (aligned to values[period-1..]); empty when short.
 */
function emaSeries(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/**
 * Last EMA value.
 * @param {number[]} values
 * @param {number} period
 * @returns {number|null}
 */
function ema(values, period) {
  const series = emaSeries(values, period);
  return series.length ? series[series.length - 1] : null;
}

/**
 * Relative Strength Index (Wilder's smoothing).
 * @param {number[]} closes
 * @param {number} [period=14]
 * @returns {number|null} 0-100, or null when there is not enough data.
 */
function rsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * MACD (12/26 EMA difference) with a signal line (9-EMA of MACD).
 * Returns the latest values plus the previous histogram so callers can see
 * whether momentum is rising.
 *
 * @param {number[]} closes
 * @param {object} [opts]
 * @param {number} [opts.fast=12]
 * @param {number} [opts.slow=26]
 * @param {number} [opts.signal=9]
 * @returns {{macd:number, signal:number, histogram:number, prevHistogram:number}|null}
 */
function macd(closes, opts = {}) {
  const { fast = 12, slow = 26, signal = 9 } = opts;
  if (!Array.isArray(closes) || closes.length < slow + signal) return null;

  const fastSeries = emaSeries(closes, fast);
  const slowSeries = emaSeries(closes, slow);
  // Align: slowSeries starts (slow - fast) entries later than fastSeries.
  const offset = slow - fast;
  const macdLine = slowSeries.map((v, i) => fastSeries[i + offset] - v);

  const signalSeries = emaSeries(macdLine, signal);
  if (signalSeries.length < 2) return null;

  const last = macdLine.length - 1;
  const histogram = macdLine[last] - signalSeries[signalSeries.length - 1];
  const prevHistogram = macdLine[last - 1] - signalSeries[signalSeries.length - 2];
  return {
    macd: macdLine[last],
    signal: signalSeries[signalSeries.length - 1],
    histogram,
    prevHistogram,
  };
}

module.exports = { sma, ema, emaSeries, rsi, macd };
