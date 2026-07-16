'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { isMarketOpen, isTradingDay, wib } = require('../src/utils/marketHours');

// Helper: an instant at a given WIB wall-clock time (WIB = UTC+7).
function atWib(y, m, d, hh, mm) {
  return new Date(Date.UTC(y, m - 1, d, hh - 7, mm));
}

test('Monday mid-morning session I is open', () => {
  // 2026-07-13 is a Monday.
  assert.equal(isMarketOpen(atWib(2026, 7, 13, 10, 0)), true);
});

test('Monday lunch break is closed', () => {
  assert.equal(isMarketOpen(atWib(2026, 7, 13, 12, 30)), false);
});

test('Monday session II is open, and closed after 15:50', () => {
  assert.equal(isMarketOpen(atWib(2026, 7, 13, 13, 35)), true);
  assert.equal(isMarketOpen(atWib(2026, 7, 13, 15, 49)), true);
  assert.equal(isMarketOpen(atWib(2026, 7, 13, 15, 55)), false);
});

test('Friday has the shorter session I and later session II', () => {
  // 2026-07-17 is a Friday.
  assert.equal(isMarketOpen(atWib(2026, 7, 17, 11, 45)), false); // after 11:30
  assert.equal(isMarketOpen(atWib(2026, 7, 17, 13, 45)), false); // before 14:00
  assert.equal(isMarketOpen(atWib(2026, 7, 17, 14, 5)), true);
});

test('weekend is closed', () => {
  // 2026-07-18 is a Saturday.
  assert.equal(isMarketOpen(atWib(2026, 7, 18, 10, 0)), false);
  assert.equal(isTradingDay(atWib(2026, 7, 18, 10, 0)), false);
});

test('exchange holiday is closed even on a weekday', () => {
  // 2026-01-01 (New Year) is a Thursday and listed in holidays.json.
  assert.equal(isMarketOpen(atWib(2026, 1, 1, 10, 0)), false);
  assert.equal(isTradingDay(atWib(2026, 1, 1, 10, 0)), false);
});

test('wib() decomposes in WIB regardless of server timezone', () => {
  const parts = wib(atWib(2026, 7, 13, 9, 5));
  assert.equal(parts.isoDate, '2026-07-13');
  assert.equal(parts.day, 1); // Monday
  assert.equal(parts.minutes, 9 * 60 + 5);
});
