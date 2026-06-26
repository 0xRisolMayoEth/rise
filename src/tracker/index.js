'use strict';

/**
 * Price Tracker entrypoint — wires the configured price source and the
 * multi-platform notifier into the tracker engine and starts the cron loop.
 *
 *   npm run tracker
 *
 * Config (see .env.example):
 *   PRICE_SOURCE         mock | idx          (default: mock)
 *   TRACKER_CRON         cron expression     (default: every minute)
 *   IDX_API_URL          quote endpoint template with {ticker}
 *   TRACKER_MAX_AGE_DAYS auto-close expired RUNNING signals (0 = off)
 */
const config = require('../config');
const { getDb } = require('../database/db');
const { getSource } = require('./sources');
const { broadcastSignal } = require('../notifier');
const { start, runOnce } = require('./tracker');

function buildDeps() {
  const source = getSource();
  return {
    fetchPrice: source.fetchPrice,
    // Status changes go to the Discord feed channel (REST) + Telegram.
    notify: (signal) => broadcastSignal(signal, { discord: true, telegram: true }),
  };
}

function main() {
  // Ensure the DB/schema exist.
  getDb();
  console.log(
    `[tracker] source=${config.tracker.source} maxAgeDays=${config.tracker.maxAgeDays}`
  );

  const deps = buildDeps();

  // Run an immediate pass on boot, then schedule the recurring loop.
  runOnce(deps).catch((e) => console.error('[tracker] initial pass error:', e));
  start(deps);
}

if (require.main === module) {
  main();
}

module.exports = { buildDeps, main };
