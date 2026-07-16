'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { buildPlan, tickSize, roundToTick } = require('../src/agents/riskManager');

const CFG = {
  capital: 100_000_000,
  maxPositionPct: 5,
  types: {
    'HAKA PREOPEN': { tp: 3, sl: 10 },
    BSJP: { tp: 3, sl: 10 },
    SWING: { tp: 10, sl: 30 },
  },
};

test('tickSize follows the IDX price fractions', () => {
  assert.equal(tickSize(150), 1);
  assert.equal(tickSize(300), 2);
  assert.equal(tickSize(1500), 5);
  assert.equal(tickSize(3000), 10);
  assert.equal(tickSize(8000), 25);
});

test('roundToTick snaps to valid prices', () => {
  assert.equal(roundToTick(156.7), 156);       // tick 1
  assert.equal(roundToTick(301), 300);         // tick 2, down
  assert.equal(roundToTick(301, 'up'), 302);
  assert.equal(roundToTick(1503, 'nearest'), 1505);
});

test('HAKA plan uses a single entry with TP +3% and SL -10%', () => {
  const plan = buildPlan({ type: 'HAKA PREOPEN', last: 1000, cfg: CFG });
  assert.ok(plan);
  assert.equal(plan.entry1, 1000);
  assert.equal(plan.entry2, null);
  assert.equal(plan.entry3, null);
  assert.equal(plan.avg, 1000);
  assert.equal(plan.tp, 1030);   // +3%, already on tick 10
  assert.equal(plan.sl, 900);    // -10%
  // budget 5% dari 100jt = 5jt; 1 lot = 100 lembar @1000 = 100rb -> 50 lot.
  assert.equal(plan.lots, 50);
});

test('BSJP plan ladders entries on supports below the live price', () => {
  const plan = buildPlan({ type: 'BSJP', last: 1000, support1: 980, support2: 950, cfg: CFG });
  assert.ok(plan);
  assert.deepEqual([plan.entry1, plan.entry2, plan.entry3], [1000, 980, 950]);
  assert.equal(plan.avg, 976.67);
  // TP/SL from the AVG, snapped down to the tick.
  assert.ok(plan.tp > plan.avg && plan.sl < plan.avg);
});

test('supports above the live price fall back to fixed steps down', () => {
  const plan = buildPlan({ type: 'SWING', last: 1000, support1: 1100, support2: 1200, cfg: CFG });
  assert.ok(plan);
  assert.equal(plan.entry1, 1000);
  assert.ok(plan.entry2 < 1000);
  assert.ok(plan.entry3 < plan.entry2);
});

test('SWING uses TP +10% / SL -30%', () => {
  const plan = buildPlan({ type: 'HAKA PREOPEN', last: 1000, cfg: CFG });
  const swing = buildPlan({ type: 'SWING', last: 1000, support1: 1000, support2: 1000, cfg: CFG });
  assert.ok(swing.tp > plan.tp);
  assert.ok(swing.sl < plan.sl);
});

test('invalid input yields no plan', () => {
  assert.equal(buildPlan({ type: 'SNIPER', last: 1000, cfg: CFG }), null);
  assert.equal(buildPlan({ type: 'BSJP', last: 0, cfg: CFG }), null);
});
