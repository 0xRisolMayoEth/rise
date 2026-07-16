'use strict';

/**
 * IDX price source (axios).
 *
 * Fetches a real-time quote for an IDX ticker. The default endpoint targets
 * Yahoo Finance's chart API (IDX symbols use the ".JK" suffix), which returns
 * the regular-market price and the day's high.
 *
 * Set IDX_API_URL to point at a different provider; `parseQuote` below is the
 * single place to adapt when the response shape differs.
 *
 * A quote is { last: number, high: number, low: number }.
 *
 * Also exposes fetchHistory() — daily OHLCV candles for the agent pipeline's
 * market scanner — built on the same chart endpoint.
 */
const config = require('../../config');
const { withRetry } = require('../../utils/retry');
const { createLogger } = require('../../utils/logger');

const log = createLogger('tracker');

let axios = null;
function getAxios() {
  if (axios) return axios;
  // eslint-disable-next-line global-require
  axios = require('axios');
  return axios;
}

/**
 * Build the request URL for a ticker from the configured template.
 * @param {string} ticker
 */
function buildUrl(ticker) {
  return config.tracker.idxUrl.replace('{ticker}', encodeURIComponent(ticker));
}

/**
 * Extract { last, high, low } from a provider response.
 * Tuned for the Yahoo chart API; adapt here for other providers.
 * @param {any} data
 * @returns {{last: number, high: number, low: number}}
 */
function parseQuote(data) {
  // Yahoo: data.chart.result[0].meta.{regularMarketPrice, regularMarketDayHigh}
  const meta =
    data &&
    data.chart &&
    Array.isArray(data.chart.result) &&
    data.chart.result[0] &&
    data.chart.result[0].meta;

  if (meta && Number.isFinite(meta.regularMarketPrice)) {
    const last = Number(meta.regularMarketPrice);
    const high = Number.isFinite(meta.regularMarketDayHigh)
      ? Number(meta.regularMarketDayHigh)
      : last;
    const low = Number.isFinite(meta.regularMarketDayLow)
      ? Number(meta.regularMarketDayLow)
      : last;
    return { last, high: Math.max(high, last), low: Math.min(low, last) };
  }

  // Generic fallback: look for common field names.
  const last = Number(data?.last ?? data?.price ?? data?.close);
  if (!Number.isFinite(last)) {
    throw new Error('unrecognised quote response shape');
  }
  const high = Number(data?.high ?? data?.dayHigh ?? last);
  const low = Number(data?.low ?? data?.dayLow ?? last);
  return {
    last,
    high: Math.max(Number.isFinite(high) ? high : last, last),
    low: Math.min(Number.isFinite(low) ? low : last, last),
  };
}

/**
 * Retry on network errors, throttling (429), and provider errors (5xx);
 * fail fast on anything else (404 for a bad ticker won't fix itself).
 * @param {Error & {response?: {status?: number}}} err
 */
function isRetryable(err) {
  const status = err.response && err.response.status;
  return !err.response || status === 429 || status >= 500;
}

/**
 * @param {string} ticker
 * @returns {Promise<{last: number, high: number}>}
 */
async function fetchPrice(ticker) {
  const url = buildUrl(ticker);
  const res = await withRetry(
    () =>
      getAxios().get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'RISE-Signal-System/0.1' },
      }),
    {
      retries: 3,
      baseMs: 800,
      shouldRetry: isRetryable,
      onRetry: (err, attempt, waitMs) =>
        log.warn(`retrying ${ticker} quote in ${waitMs}ms (attempt ${attempt}/3)`, {
          error: err.message,
        }),
    }
  );
  return parseQuote(res.data);
}

/**
 * Extract daily OHLCV candles from a Yahoo chart response.
 * Skips days with a null close (halted/no trade).
 * @param {any} data
 * @returns {Array<{time:number, open:number, high:number, low:number, close:number, volume:number}>}
 */
function parseHistory(data) {
  const result =
    data && data.chart && Array.isArray(data.chart.result) && data.chart.result[0];
  const q = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
  if (!result || !Array.isArray(result.timestamp) || !q) {
    throw new Error('unrecognised history response shape');
  }

  const candles = [];
  for (let i = 0; i < result.timestamp.length; i += 1) {
    const close = q.close && q.close[i];
    if (!Number.isFinite(close)) continue;
    candles.push({
      time: result.timestamp[i],
      open: Number.isFinite(q.open && q.open[i]) ? q.open[i] : close,
      high: Number.isFinite(q.high && q.high[i]) ? q.high[i] : close,
      low: Number.isFinite(q.low && q.low[i]) ? q.low[i] : close,
      close,
      volume: Number.isFinite(q.volume && q.volume[i]) ? q.volume[i] : 0,
    });
  }
  return candles;
}

/**
 * Fetch daily OHLCV history for a ticker (agent market scanner).
 * @param {string} ticker
 * @param {string} [range='3mo']  Yahoo range token (1mo, 3mo, 6mo, ...).
 * @returns {Promise<Array<{time:number, open:number, high:number, low:number, close:number, volume:number}>>}
 */
async function fetchHistory(ticker, range = '3mo') {
  const url = `${buildUrl(ticker)}?range=${encodeURIComponent(range)}&interval=1d`;
  const res = await withRetry(
    () =>
      getAxios().get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'RISE-Signal-System/0.1' },
      }),
    {
      retries: 3,
      baseMs: 800,
      shouldRetry: isRetryable,
      onRetry: (err, attempt, waitMs) =>
        log.warn(`retrying ${ticker} history in ${waitMs}ms (attempt ${attempt}/3)`, {
          error: err.message,
        }),
    }
  );
  return parseHistory(res.data);
}

/**
 * Fetch daily OHLCV history for the IHSG index (^JKSE) — used by the agent
 * pipeline's market-regime filter. Separate URL because the per-ticker
 * template appends the ".JK" suffix, which index symbols don't use.
 * @param {string} [range='3mo']
 */
async function fetchIndexHistory(range = '3mo') {
  const url =
    `${config.agents.regime.indexUrl}?range=${encodeURIComponent(range)}&interval=1d`;
  const res = await withRetry(
    () =>
      getAxios().get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'RISE-Signal-System/0.1' },
      }),
    {
      retries: 3,
      baseMs: 800,
      shouldRetry: isRetryable,
      onRetry: (err, attempt, waitMs) =>
        log.warn(`retrying index history in ${waitMs}ms (attempt ${attempt}/3)`, {
          error: err.message,
        }),
    }
  );
  return parseHistory(res.data);
}

module.exports = {
  fetchPrice,
  fetchHistory,
  fetchIndexHistory,
  buildUrl,
  parseQuote,
  parseHistory,
  isRetryable,
};
