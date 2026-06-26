'use strict';

/**
 * Price Tracker engine.
 *
 * On each pass it pulls a real-time quote for every RUNNING signal and:
 *   - keeps the high-water mark (`high`) and profit % up to date;
 *   - flips RUNNING -> DONE once the price reaches TP (the +N% target);
 *   - optionally flips RUNNING -> DONE when a signal exceeds maxAgeDays
 *     (expired), per CLAUDE.md.
 * Profit % is computed from the entry AVG and the High price.
 *
 * Every status change is broadcast to Discord + Telegram via the notifier;
 * DONE signals are also announced in the "information done" channel.
 * Dependencies (price source + notifier) are injected so the engine is easy
 * to test in isolation.
 */
const config = require('../config');
const { listSignals, updateStatus, updateMetrics } = require('../models/signal');

/**
 * Profit % from a base (AVG/entry) and the high price.
 * @param {number|null} base
 * @param {number|null} high
 * @returns {number|null} rounded to 2dp, or null when not computable.
 */
function computeProfit(base, high) {
  if (!base || high === null || high === undefined) return null;
  return Math.round(((high - base) / base) * 10000) / 100;
}

/**
 * Age of a signal in whole days from its created_at (localtime text).
 * @param {string} createdAt
 * @returns {number}
 */
function ageInDays(createdAt) {
  if (!createdAt) return 0;
  const t = Date.parse(String(createdAt).replace(' ', 'T'));
  if (Number.isNaN(t)) return 0;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

/**
 * Process a single signal against a fresh quote.
 * Returns the updated signal if its status changed, else null.
 *
 * @param {object} s          RUNNING signal row.
 * @param {{last:number, high:number}} quote
 * @param {number} maxAgeDays
 * @returns {object|null}
 */
function processSignal(s, quote, maxAgeDays) {
  const base = s.avg ?? s.entry1 ?? null;
  // High-water mark across passes: never let it shrink.
  const high = Math.max(s.high ?? 0, quote.high ?? 0, quote.last ?? 0);
  const profit = computeProfit(base, high);

  // TP reached (price hit +N% target) -> DONE.
  if ((quote.last >= s.tp || high >= s.tp) && s.tp) {
    return updateStatus(s.id, {
      status: 'DONE',
      high,
      profit_pct: profit,
      note: `Auto DONE — target tercapai @ ${quote.last} (TP ${s.tp})`,
    });
  }

  // Expired -> DONE (only when expiry is enabled).
  if (maxAgeDays > 0 && ageInDays(s.created_at) >= maxAgeDays) {
    return updateStatus(s.id, {
      status: 'DONE',
      high,
      profit_pct: profit,
      note: `Auto DONE — expired after ${maxAgeDays}d`,
    });
  }

  // No status change: just keep the high/profit current (no audit row).
  if (high > (s.high ?? 0)) {
    updateMetrics(s.id, { high, profit_pct: profit });
  }
  return null;
}

/**
 * Run a single tracking pass over all RUNNING signals.
 *
 * @param {object} deps
 * @param {(ticker:string)=>Promise<{last:number,high:number}>} deps.fetchPrice
 * @param {(signal:object)=>Promise<void>} [deps.notify]   Called on status change.
 * @param {number} [deps.maxAgeDays=config.tracker.maxAgeDays]
 * @returns {Promise<{checked:number, changed:object[]}>}
 */
async function runOnce(deps) {
  const { fetchPrice, notify, maxAgeDays = config.tracker.maxAgeDays } = deps;
  const running = listSignals({ status: 'RUNNING', limit: 1000 });
  const changed = [];

  for (const s of running) {
    try {
      const quote = await fetchPrice(s.ticker);
      const updated = processSignal(s, quote, maxAgeDays);
      if (updated) {
        changed.push(updated);
        console.log(
          `[tracker] ${updated.ticker} ${s.status} -> ${updated.status} ` +
            `(last ${quote.last}, high ${updated.high}, profit ${updated.profit_pct}%)`
        );
        if (notify) await notify(updated);
      }
    } catch (e) {
      console.error(`[tracker] ${s.ticker} pass failed:`, e.message);
    }
  }

  return { checked: running.length, changed };
}

/**
 * Schedule recurring tracking passes via node-cron.
 *
 * @param {object} deps              Same shape as runOnce's deps.
 * @param {string} [cronExpr=config.tracker.cron]
 * @returns {import('node-cron').ScheduledTask}
 */
function start(deps, cronExpr = config.tracker.cron) {
  // eslint-disable-next-line global-require
  const cron = require('node-cron');
  console.log(`[tracker] scheduled: ${cronExpr}`);
  return cron.schedule(cronExpr, () => {
    runOnce(deps).catch((e) => console.error('[tracker] pass error:', e));
  });
}

module.exports = { runOnce, start, processSignal, computeProfit, ageInDays };
