'use strict';

/**
 * Price Tracker engine.
 *
 * On each pass it pulls a real-time quote for every RUNNING signal and:
 *   - keeps the high-water mark (`high`) and profit % up to date;
 *   - flips RUNNING -> DONE once the price reaches TP (the +N% target);
 *   - flips RUNNING -> CUT LOSS once the price touches the stop loss (`sl`),
 *     when the signal has one — TP wins if both trigger in the same pass.
 * There is no age-based auto-close: a RUNNING signal stays RUNNING until it
 * touches TP or SL (or an analyst closes it manually).
 * Profit % is computed from the entry AVG and the High price.
 *
 * Every status change is broadcast to Discord + Telegram via the notifier;
 * DONE signals are also announced in the "information done" channel.
 * Dependencies (price source + notifier) are injected so the engine is easy
 * to test in isolation.
 */
const config = require('../config');
const { listSignals, updateStatus, updateMetrics } = require('../models/signal');
const { createLogger } = require('../utils/logger');
const { isMarketOpen } = require('../utils/marketHours');
const { sleep } = require('../utils/retry');
const ops = require('../models/ops');

const log = createLogger('tracker');

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
 * Process a single signal against a fresh quote.
 * Returns the updated signal if its status changed, else null.
 *
 * @param {object} s          RUNNING signal row.
 * @param {{last:number, high:number, low?:number}} quote
 * @returns {object|null}
 */
function processSignal(s, quote) {
  const base = s.avg ?? s.entry1 ?? null;
  // High-water mark across passes: never let it shrink.
  const high = Math.max(s.high ?? 0, quote.high ?? 0, quote.last ?? 0);
  const profit = computeProfit(base, high);

  // TP reached (price hit +N% target) -> DONE.
  // Takes priority over the SL when both trigger in the same pass.
  if ((quote.last >= s.tp || high >= s.tp) && s.tp) {
    return updateStatus(s.id, {
      status: 'DONE',
      high,
      profit_pct: profit,
      note: `Auto DONE — target tercapai @ ${quote.last} (TP ${s.tp})`,
    });
  }

  // Stop loss touched -> CUT LOSS. Uses the day low when available so an
  // intraday dip between passes still triggers. Loss % is the realistic
  // exit at the SL price, not the high-water profit.
  const low = Math.min(quote.low ?? quote.last, quote.last);
  if (s.sl && low <= s.sl) {
    return updateStatus(s.id, {
      status: 'CUT LOSS',
      high,
      profit_pct: computeProfit(base, s.sl),
      note: `Auto CUT LOSS @ ${quote.last} (SL ${s.sl})`,
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
 * @returns {Promise<{checked:number, changed:object[]}>}
 */
async function runOnce(deps) {
  const {
    fetchPrice,
    notify,
    fetchDelayMs = config.tracker.fetchDelayMs,
  } = deps;
  const running = listSignals({ status: 'RUNNING', limit: 1000 });
  const changed = [];

  // One quote per ticker per pass (several signals can share a ticker),
  // spaced out so the quote provider is never hammered.
  const tickers = [...new Set(running.map((s) => s.ticker))];
  const quotes = new Map();
  for (let i = 0; i < tickers.length; i += 1) {
    if (i > 0 && fetchDelayMs > 0) await sleep(fetchDelayMs);
    try {
      quotes.set(tickers[i], await fetchPrice(tickers[i]));
    } catch (e) {
      log.error(`quote fetch failed for ${tickers[i]}`, { error: e.message });
    }
  }

  for (const s of running) {
    const quote = quotes.get(s.ticker);
    if (!quote) continue;
    try {
      const updated = processSignal(s, quote);
      if (updated) {
        changed.push(updated);
        log.info(
          `${updated.ticker} ${s.status} -> ${updated.status} ` +
            `(last ${quote.last}, high ${updated.high}, profit ${updated.profit_pct}%)`
        );
        if (notify) await notify(updated);
      }
    } catch (e) {
      log.error(`${s.ticker} pass failed`, { error: e.message });
    }
  }

  // A pass is only healthy when quotes actually came back (or there was
  // nothing to check) — the staleness alert keys off this heartbeat.
  if (tickers.length > 0 && quotes.size === 0) {
    ops.beatError('tracker', 'all quote fetches failed');
  } else {
    ops.beatOk('tracker');
  }

  return { checked: running.length, changed };
}

/**
 * Alert the admin channel when the tracker has stopped completing passes
 * while the market is open (quote source down, persistent throttling, …).
 * Cooldown prevents alert spam; systemd restart covers a dead process.
 *
 * @param {(text:string)=>Promise<any>} [notifyAdmin]
 * @returns {Promise<boolean>} true when an alert was sent.
 */
async function checkStaleness(notifyAdmin) {
  const { staleAlertMin, alertCooldownMin } = config.tracker;
  if (!notifyAdmin || staleAlertMin <= 0) return false;

  const staleMin = ops.minutesSinceOk('tracker');
  if (staleMin === null || staleMin < staleAlertMin) return false;

  const sinceAlert = ops.minutesSinceAlert('tracker');
  if (sinceAlert !== null && sinceAlert < alertCooldownMin) return false;

  ops.markAlerted('tracker');
  const text =
    `TRACKER ALERT — no successful pass for ${Math.round(staleMin)} minutes ` +
    `(threshold ${staleAlertMin}m). Check the quote source and logs/tracker.log.`;
  try {
    await notifyAdmin(text);
    log.warn('staleness alert sent', { staleMin: Math.round(staleMin) });
    return true;
  } catch (e) {
    log.error('staleness alert failed to send', { error: e.message });
    return false;
  }
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
  const { marketHoursOnly } = config.tracker;
  log.info(`scheduled: ${cronExpr} (marketHoursOnly=${marketHoursOnly})`);

  let pausedLogged = false; // log the closed-market skip once per closure, not every tick
  return cron.schedule(cronExpr, async () => {
    if (marketHoursOnly && !isMarketOpen()) {
      if (!pausedLogged) {
        log.info('market closed — passes paused');
        pausedLogged = true;
      }
      return;
    }
    if (pausedLogged) {
      log.info('market open — passes resumed');
      pausedLogged = false;
    }

    try {
      await runOnce(deps);
    } catch (e) {
      log.error('pass error', { error: e.message });
      ops.beatError('tracker', e.message);
    }
    await checkStaleness(deps.notifyAdmin);
  });
}

module.exports = {
  runOnce,
  start,
  checkStaleness,
  processSignal,
  computeProfit,
};
