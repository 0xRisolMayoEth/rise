'use strict';

/**
 * Retry an async operation with exponential backoff and jitter.
 * Used by the price sources so a throttled/flaky quote API degrades
 * gracefully instead of silently skipping signals.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {() => Promise<any>} fn
 * @param {object} [opts]
 * @param {number}  [opts.retries=3]      Extra attempts after the first failure.
 * @param {number}  [opts.baseMs=800]     First backoff delay.
 * @param {number}  [opts.factor=2]       Backoff multiplier per attempt.
 * @param {number}  [opts.maxMs=8000]     Delay ceiling.
 * @param {(err: Error) => boolean} [opts.shouldRetry]  Return false to fail fast.
 * @param {(err: Error, attempt: number, waitMs: number) => void} [opts.onRetry]
 * @returns {Promise<any>}
 */
async function withRetry(fn, opts = {}) {
  const {
    retries = 3,
    baseMs = 800,
    factor = 2,
    maxMs = 8000,
    shouldRetry = () => true,
    onRetry,
  } = opts;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const delay = Math.min(baseMs * factor ** attempt, maxMs);
      // Full jitter on the upper half so parallel workers never sync up.
      const waitMs = Math.round(delay / 2 + Math.random() * (delay / 2));
      if (onRetry) onRetry(err, attempt + 1, waitMs);
      await sleep(waitMs);
      attempt += 1;
    }
  }
}

module.exports = { withRetry, sleep };
