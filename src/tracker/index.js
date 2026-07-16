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
 */
const config = require('../config');
const { getDb } = require('../database/db');
const { getSource } = require('./sources');
const { broadcastSignal, notifyAdmin } = require('../notifier');
const { start, runOnce } = require('./tracker');
const { createLogger } = require('../utils/logger');

const log = createLogger('tracker');

function buildDeps() {
  const source = getSource();
  return {
    fetchPrice: source.fetchPrice,
    // Status changes go to the Discord feed channel (REST) + Telegram.
    notify: (signal) => broadcastSignal(signal, { discord: true, telegram: true }),
    // Ops alerts (staleness) go to the Discord admin channel only.
    notifyAdmin,
  };
}

function main() {
  // Ensure the DB/schema exist.
  getDb();
  log.info(
    `source=${config.tracker.source} ` +
      `marketHoursOnly=${config.tracker.marketHoursOnly} ` +
      `fetchDelayMs=${config.tracker.fetchDelayMs}`
  );

  const deps = buildDeps();

  // Run an immediate pass on boot, then schedule the recurring loop.
  runOnce(deps).catch((e) => log.error('initial pass error', { error: e.message }));
  start(deps);
}

if (require.main === module) {
  main();
}

module.exports = { buildDeps, main };
