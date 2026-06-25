'use strict';

/**
 * Price Tracker (cron job) — scaffold.
 *
 * Periodically pulls real-time IDX prices and auto-advances signal status:
 *   RUNNING -> TP1 HIT   when price >= TP
 *   RUNNING -> DONE      on manual close / expiry / invalid
 * then recomputes profit % from AVG and High, and re-broadcasts updates.
 *
 * Wire up node-cron + the IDX/price source here. Left as a stub so the
 * architecture is in place without committing to a specific data provider.
 */
const { listSignals, updateStatus } = require('../models/signal');

/**
 * Run a single tracking pass over all RUNNING signals.
 * `fetchPrice` is injected so the data source can be swapped/tested.
 *
 * @param {(ticker: string) => Promise<{last: number, high: number}>} fetchPrice
 */
async function runOnce(fetchPrice) {
  const running = listSignals({ status: 'RUNNING', limit: 1000 });

  for (const s of running) {
    try {
      const { last, high } = await fetchPrice(s.ticker);
      if (last >= s.tp) {
        const base = s.avg ?? s.entry1;
        const profit = base ? ((high - base) / base) * 100 : null;
        updateStatus(s.id, {
          status: 'TP1 HIT',
          high,
          profit_pct: profit,
          note: `Auto TP1 HIT @ ${last}`,
        });
        console.log(`[tracker] ${s.ticker} -> TP1 HIT (${last} >= ${s.tp})`);
      }
    } catch (e) {
      console.error(`[tracker] price fetch failed for ${s.ticker}:`, e.message);
    }
  }
}

/**
 * Start the cron schedule. Default: every minute during market hours.
 * @param {(ticker: string) => Promise<{last: number, high: number}>} fetchPrice
 * @param {string} [cronExpr]
 */
function start(fetchPrice, cronExpr = '* * * * *') {
  // eslint-disable-next-line global-require
  const cron = require('node-cron');
  console.log(`[tracker] scheduled: ${cronExpr}`);
  return cron.schedule(cronExpr, () => runOnce(fetchPrice));
}

module.exports = { runOnce, start };
