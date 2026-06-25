'use strict';

const { getDb } = require('../database/db');

/**
 * Data-access helpers for the `signals` table.
 * Every status change also writes a row to `signal_updates` for the audit log.
 */

/**
 * Compute the average entry from the available entry prices.
 * Ignores missing entries. Returns null when there are none.
 * @param {Array<number|null>} entries
 * @returns {number|null}
 */
function computeAvg(entries) {
  const nums = entries.filter((e) => e !== null && e !== undefined && !Number.isNaN(e));
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 100) / 100;
}

/**
 * Insert a new RUNNING signal.
 *
 * @param {object} input
 * @param {string} input.ticker
 * @param {string} input.type      Canonical DB type ("HAKA PREOPEN", ...).
 * @param {number|null} input.entry1
 * @param {number|null} input.entry2
 * @param {number|null} input.entry3
 * @param {number} input.tp
 * @returns {object} the created signal row.
 */
function createSignal(input) {
  const db = getDb();
  const avg = computeAvg([input.entry1, input.entry2, input.entry3]);

  const insert = db.prepare(`
    INSERT INTO signals (ticker, type, entry1, entry2, entry3, avg, tp, status)
    VALUES (@ticker, @type, @entry1, @entry2, @entry3, @avg, @tp, 'RUNNING')
  `);

  const logUpdate = db.prepare(`
    INSERT INTO signal_updates (signal_id, status, note)
    VALUES (?, 'RUNNING', 'Signal created')
  `);

  // Wrap insert + audit-log in a single transaction.
  const tx = db.transaction((row) => {
    const result = insert.run({
      ticker: row.ticker,
      type: row.type,
      entry1: row.entry1,
      entry2: row.entry2,
      entry3: row.entry3,
      avg,
      tp: row.tp,
    });
    logUpdate.run(result.lastInsertRowid);
    return result.lastInsertRowid;
  });

  const id = tx(input);
  return getSignalById(id);
}

/**
 * @param {number} id
 * @returns {object|undefined}
 */
function getSignalById(id) {
  return getDb().prepare('SELECT * FROM signals WHERE id = ?').get(id);
}

/**
 * List signals, optionally filtered by status and/or type.
 * @param {object} [opts]
 * @param {string} [opts.status]
 * @param {string} [opts.type]
 * @param {number} [opts.limit=50]
 * @returns {object[]}
 */
function listSignals(opts = {}) {
  const clauses = [];
  const params = {};
  if (opts.status) {
    clauses.push('status = @status');
    params.status = opts.status;
  }
  if (opts.type) {
    clauses.push('type = @type');
    params.type = opts.type;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.limit = opts.limit || 50;

  return getDb()
    .prepare(`SELECT * FROM signals ${where} ORDER BY id DESC LIMIT @limit`)
    .all(params);
}

/**
 * Update a signal's status, optionally recording high/profit, and append
 * to the audit log.
 *
 * @param {number} id
 * @param {object} patch
 * @param {string} patch.status   RUNNING | TP1 HIT | DONE
 * @param {number} [patch.high]
 * @param {number} [patch.profit_pct]
 * @param {string} [patch.note]
 * @returns {object|undefined} the updated row.
 */
function updateStatus(id, patch) {
  const db = getDb();
  const closing = patch.status === 'DONE';

  const update = db.prepare(`
    UPDATE signals SET
      status = @status,
      high = COALESCE(@high, high),
      profit_pct = COALESCE(@profit_pct, profit_pct),
      updated_at = datetime('now','localtime'),
      closed_at = CASE WHEN @closing = 1 THEN datetime('now','localtime') ELSE closed_at END
    WHERE id = @id
  `);

  const logUpdate = db.prepare(`
    INSERT INTO signal_updates (signal_id, status, note)
    VALUES (@id, @status, @note)
  `);

  const tx = db.transaction(() => {
    update.run({
      id,
      status: patch.status,
      high: patch.high ?? null,
      profit_pct: patch.profit_pct ?? null,
      closing: closing ? 1 : 0,
    });
    logUpdate.run({ id, status: patch.status, note: patch.note ?? null });
  });

  tx();
  return getSignalById(id);
}

module.exports = {
  computeAvg,
  createSignal,
  getSignalById,
  listSignals,
  updateStatus,
};
