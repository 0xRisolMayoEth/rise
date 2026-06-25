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
 * A quote is { last: number, high: number }.
 */
const config = require('../../config');

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
 * Extract { last, high } from a provider response.
 * Tuned for the Yahoo chart API; adapt here for other providers.
 * @param {any} data
 * @returns {{last: number, high: number}}
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
    return { last, high: Math.max(high, last) };
  }

  // Generic fallback: look for common field names.
  const last = Number(data?.last ?? data?.price ?? data?.close);
  if (!Number.isFinite(last)) {
    throw new Error('unrecognised quote response shape');
  }
  const high = Number(data?.high ?? data?.dayHigh ?? last);
  return { last, high: Math.max(Number.isFinite(high) ? high : last, last) };
}

/**
 * @param {string} ticker
 * @returns {Promise<{last: number, high: number}>}
 */
async function fetchPrice(ticker) {
  const url = buildUrl(ticker);
  const res = await getAxios().get(url, {
    timeout: 10000,
    headers: { 'User-Agent': 'RISE-Signal-System/0.1' },
  });
  return parseQuote(res.data);
}

module.exports = { fetchPrice, buildUrl, parseQuote };
