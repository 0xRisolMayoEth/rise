'use strict';

// Point the shared DB at a throwaway file BEFORE anything requires config.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `rise-agents-test-${process.pid}-${Date.now()}.sqlite3`
);

const { test, after } = require('node:test');
const assert = require('node:assert');

const { passesFilters } = require('../src/agents/marketScanner');
const { analyse, levels } = require('../src/agents/technicalAnalyst');
const { review } = require('../src/agents/newsAnalyst');
const { assess } = require('../src/agents/marketRegime');
const { select } = require('../src/agents/portfolioManager');
const { formatSignal } = require('../src/utils/format');
const { createSignal, getSignalById } = require('../src/models/signal');
const { saveCandidates, listCandidates } = require('../src/models/candidates');
const { processSignal } = require('../src/tracker/tracker');

after(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${process.env.DATABASE_PATH}${suffix}`, { force: true });
  }
});

/** Build n daily candles trending up ~1%/day with steady volume. */
function uptrend(n, { base = 1000, volume = 1_000_000, spikeLast = 1 } = {}) {
  const candles = [];
  let close = base;
  for (let i = 0; i < n; i += 1) {
    close = Math.round(close * 1.01);
    candles.push({
      time: i,
      open: Math.round(close * 0.995),
      high: Math.round(close * 1.005),
      low: Math.round(close * 0.99),
      close,
      volume: volume * (i === n - 1 ? spikeLast : 1),
    });
  }
  return candles;
}

const FILTERS = { minPrice: 60, minValue: 1_000_000_000, volumeSpike: 1.5 };

test('scanner rejects short history, cheap price, thin value, and no spike', () => {
  assert.equal(passesFilters(uptrend(10), FILTERS).pass, false);
  assert.equal(passesFilters(uptrend(40, { base: 40, spikeLast: 3 }), FILTERS).pass, false);
  assert.equal(
    passesFilters(uptrend(40, { volume: 100, spikeLast: 3 }), FILTERS).pass,
    false
  );
  assert.equal(passesFilters(uptrend(40, { spikeLast: 1 }), FILTERS).pass, false);
});

test('scanner passes a liquid uptrend with a volume spike', () => {
  const check = passesFilters(uptrend(40, { spikeLast: 3 }), FILTERS);
  assert.equal(check.pass, true);
});

test('technical analyst scores an uptrend with spike highly and derives levels', () => {
  const candles = uptrend(60, { spikeLast: 3 });
  const a = analyse(candles);
  assert.ok(a, 'analysis should exist');
  assert.ok(a.score >= 70, `expected score >= 70, got ${a.score}`);
  assert.equal(a.trend, 'Bullish');

  const { support1, support2, resistance } = levels(candles);
  assert.ok(resistance >= support1 && support1 >= support2);
});

test('technical analyst returns null on short history', () => {
  assert.equal(analyse(uptrend(20)), null);
});

test('news analyst vetoes a 2-day pump and a big gap-up', () => {
  const pump = uptrend(10);
  pump[9] = { ...pump[9], close: Math.round(pump[7].close * 1.3) };
  assert.equal(review({ ticker: 'X', candles: pump }).veto, true);

  const gap = uptrend(10);
  gap[9] = { ...gap[9], open: Math.round(gap[8].close * 1.15) };
  assert.equal(review({ ticker: 'X', candles: gap }).veto, true);

  assert.equal(review({ ticker: 'X', candles: uptrend(10) }).veto, false);
});

test('market regime: bullish above EMA20, bearish below it or on a hard drop', () => {
  const cfg = { maxDailyDrop: 1 };
  const up = uptrend(40);
  assert.equal(assess(up, cfg).bullish, true);

  // Downtrend: last close sits below the EMA20.
  const down = uptrend(40).map((c, i, arr) => {
    const close = Math.round(7000 * Math.pow(0.99, i));
    return { ...c, close };
  });
  assert.equal(assess(down, cfg).bullish, false);

  // Uptrend but a >1% drop today.
  const drop = uptrend(40);
  drop[39] = { ...drop[39], close: Math.round(drop[38].close * 0.98) };
  const verdict = assess(drop, cfg);
  // Still above EMA20 (long uptrend), so the daily-drop rule must catch it.
  assert.equal(verdict.bullish, false);
  assert.match(verdict.reason, /turun/);
});

test('market regime fails open on short data', () => {
  assert.equal(assess(uptrend(10), { maxDailyDrop: 1 }).bullish, true);
});

test('portfolio manager caps per run, skips RUNNING tickers, respects max open', () => {
  const cfg = { maxSignalsPerRun: 2, maxOpenPositions: 4, maxPositionPct: 5 };
  const open = [{ ticker: 'AAAA' }, { ticker: 'BBBB' }, { ticker: 'CCCC' }];
  const candidates = [
    { ticker: 'AAAA' }, // already RUNNING
    { ticker: 'DDDD' }, // takes the last open slot
    { ticker: 'EEEE' }, // blocked: max open reached
  ];
  const r = select(candidates, cfg, open);
  assert.deepEqual(r.accepted.map((c) => c.ticker), ['DDDD']);
  assert.equal(r.rejected.length, 2);
  assert.equal(r.openCount, 4);
});

test('candidates round-trip through the DB with parsed metrics', () => {
  saveCandidates('2026-07-16', [
    { ticker: 'SCMA', score: 88, last: 214, support1: 200, support2: 190, resistance: 222, metrics: { rsi14: 60 } },
    { ticker: 'BBRI', score: 75, last: 4200, metrics: null },
  ]);
  const rows = listCandidates('2026-07-16');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ticker, 'SCMA'); // highest score first
  assert.deepEqual(rows[0].metrics, { rsi14: 60 });

  // Idempotent per day: a re-save replaces, never duplicates.
  saveCandidates('2026-07-16', [{ ticker: 'SCMA', score: 90, last: 214 }]);
  assert.equal(listCandidates('2026-07-16').length, 1);
});

test('tracker flips RUNNING -> CUT LOSS when the low touches the SL', () => {
  const s = createSignal({
    ticker: 'CLTEST', type: 'BSJP', entry1: 1000, entry2: null, entry3: null,
    tp: 1030, sl: 900, source: 'agent', score: 80,
  });
  const updated = processSignal(s, { last: 890, high: 1000, low: 885 }, 0);
  assert.equal(updated.status, 'CUT LOSS');
  assert.equal(updated.profit_pct, -10); // exit at the SL price vs AVG
  assert.ok(updated.closed_at, 'CUT LOSS closes the signal');
});

test('tracker prefers TP (-> DONE) over SL in the same pass', () => {
  const s = createSignal({
    ticker: 'TPTEST', type: 'BSJP', entry1: 1000, entry2: null, entry3: null,
    tp: 1030, sl: 900, source: 'agent', score: 80,
  });
  const updated = processSignal(s, { last: 880, high: 1040, low: 870 }, 0);
  assert.equal(updated.status, 'DONE');
});

test('signals without an SL never cut loss', () => {
  const s = createSignal({
    ticker: 'MANUAL', type: 'SWING', entry1: 1000, entry2: null, entry3: null, tp: 1100,
  });
  const updated = processSignal(s, { last: 500, high: 1000, low: 490 }, 0);
  assert.equal(updated, null);
  assert.equal(getSignalById(s.id).status, 'RUNNING');
});

test('formatSignal renders the SL line and CUT LOSS status', () => {
  const text = formatSignal(
    {
      ticker: 'SCMA', type: 'BSJP', entry1: 214, entry2: 200, entry3: 190,
      avg: 200, tp: 222, sl: 180, status: 'CUT LOSS', high: 205, profit_pct: -10,
    },
    new Date('2026-06-24T08:12:00Z')
  );
  assert.match(text, /● CUT LOSS/);
  assert.match(text, /├ SL {5}: 180/);
  assert.match(text, /├ Profit : -10\.00%/);
  assert.ok(!text.includes('✓'), 'no TP check mark on a cut loss');
});

test('formatSignal keeps the check mark for TP1 HIT and omits SL when absent', () => {
  const hit = formatSignal(
    { ticker: 'SCMA', type: 'BSJP', entry1: 214, avg: 214, tp: 222, status: 'TP1 HIT', high: 223, profit_pct: 4.21 },
    new Date()
  );
  assert.match(hit, /TP {5}: 222 ✓/);
  assert.ok(!hit.includes('SL'), 'no SL line for manual signals');
});
