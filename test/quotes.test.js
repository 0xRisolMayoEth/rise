'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseQuote, isRetryable } = require('../src/tracker/sources/idx');
const { computeProfit } = require('../src/tracker/tracker');

test('parseQuote reads the Yahoo chart shape', () => {
  const data = {
    chart: {
      result: [
        {
          meta: {
            regularMarketPrice: 214,
            regularMarketDayHigh: 223,
            regularMarketDayLow: 210,
          },
        },
      ],
    },
  };
  assert.deepEqual(parseQuote(data), { last: 214, high: 223, low: 210 });
});

test('parseQuote never returns high below last (or low above it)', () => {
  const data = {
    chart: { result: [{ meta: { regularMarketPrice: 230, regularMarketDayHigh: 223 } }] },
  };
  assert.deepEqual(parseQuote(data), { last: 230, high: 230, low: 230 });
});

test('parseQuote falls back to generic field names', () => {
  assert.deepEqual(parseQuote({ last: 100, high: 105, low: 96 }), {
    last: 100,
    high: 105,
    low: 96,
  });
  assert.deepEqual(parseQuote({ price: 100 }), { last: 100, high: 100, low: 100 });
});

test('parseQuote rejects unrecognised shapes', () => {
  assert.throws(() => parseQuote({}), /unrecognised/);
});

test('isRetryable: network + 429/5xx retry, 4xx fails fast', () => {
  assert.equal(isRetryable(new Error('ECONNRESET')), true);
  assert.equal(isRetryable({ response: { status: 429 } }), true);
  assert.equal(isRetryable({ response: { status: 503 } }), true);
  assert.equal(isRetryable({ response: { status: 404 } }), false);
});

test('computeProfit rounds to 2dp from base and high', () => {
  assert.equal(computeProfit(200, 222), 11);
  assert.equal(computeProfit(214, 223), 4.21);
  assert.equal(computeProfit(null, 223), null);
  assert.equal(computeProfit(200, null), null);
});
