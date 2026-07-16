'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { sma, ema, emaSeries, rsi, macd } = require('../src/agents/indicators');

test('sma averages the last period values', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 5), 3);
  assert.equal(sma([1, 2, 3, 4, 5], 2), 4.5);
  assert.equal(sma([1, 2], 5), null);
});

test('ema is seeded with the SMA and follows the standard recursion', () => {
  // period 3, k = 0.5: seed = (2+4+6)/3 = 4; then 8*.5+4*.5 = 6; 10*.5+6*.5 = 8.
  assert.deepEqual(emaSeries([2, 4, 6, 8, 10], 3), [4, 6, 8]);
  assert.equal(ema([2, 4, 6, 8, 10], 3), 8);
  assert.equal(ema([1, 2], 3), null);
});

test('rsi is 100 on straight gains and ~0 on straight losses', () => {
  const up = Array.from({ length: 20 }, (_, i) => 100 + i);
  assert.equal(rsi(up, 14), 100);

  const down = Array.from({ length: 20 }, (_, i) => 100 - i);
  assert.ok(rsi(down, 14) < 1);

  assert.equal(rsi([1, 2, 3], 14), null);
});

test('rsi matches a hand-checked Wilder value', () => {
  // Alternating +2/-1 moves: avgGain/avgLoss hovers around 2:1 => RSI ~66.67
  // (Wilder smoothing oscillates slightly around the asymptote).
  const closes = [100];
  for (let i = 0; i < 28; i += 1) {
    closes.push(closes[closes.length - 1] + (i % 2 === 0 ? 2 : -1));
  }
  const value = rsi(closes, 14);
  assert.ok(Math.abs(value - 66.67) < 2, `expected ~66.67, got ${value}`);
});

test('macd histogram is positive in an accelerating uptrend', () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 * Math.pow(1.01, i));
  const m = macd(closes);
  assert.ok(m);
  assert.ok(m.macd > 0);
  assert.ok(m.histogram >= 0);
});

test('macd returns null when there is not enough data', () => {
  assert.equal(macd(Array(20).fill(100)), null);
});

test('macd is zero on a flat series', () => {
  const m = macd(Array(60).fill(100));
  assert.ok(m);
  assert.equal(Math.round(m.macd * 1000), 0);
  assert.equal(Math.round(m.histogram * 1000), 0);
});
