'use strict';

const { getDb } = require('../database/db');

/**
 * Operational bookkeeping: persisted errors + per-service heartbeats.
 *
 * Heartbeat timestamps are epoch milliseconds (see schema.sql) so staleness
 * math never depends on the server timezone.
 */

/**
 * Persist one error row. Called automatically by the logger's error level.
 * @param {string} service
 * @param {string} message
 * @param {any} [context]  Serialised to JSON when possible.
 */
function recordError(service, message, context) {
  let ctx = null;
  if (context !== undefined) {
    try {
      ctx = JSON.stringify(context);
    } catch {
      ctx = String(context);
    }
  }
  getDb()
    .prepare('INSERT INTO errors (service, message, context) VALUES (?, ?, ?)')
    .run(service, String(message), ctx);
}

/** @param {number} [limit] */
function recentErrors(limit = 50) {
  return getDb()
    .prepare('SELECT * FROM errors ORDER BY id DESC LIMIT ?')
    .all(limit);
}

/** Record a successful pass for a service. */
function beatOk(service) {
  getDb()
    .prepare(
      `INSERT INTO heartbeats (service, last_ok_at, ok_count) VALUES (?, ?, 1)
       ON CONFLICT(service) DO UPDATE SET
         last_ok_at = excluded.last_ok_at,
         ok_count = ok_count + 1`
    )
    .run(service, Date.now());
}

/** Record a failed pass for a service. */
function beatError(service, message) {
  getDb()
    .prepare(
      `INSERT INTO heartbeats (service, last_error_at, last_error, error_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(service) DO UPDATE SET
         last_error_at = excluded.last_error_at,
         last_error = excluded.last_error,
         error_count = error_count + 1`
    )
    .run(service, Date.now(), String(message ?? ''));
}

/** @returns {object|undefined} the heartbeat row. */
function getHeartbeat(service) {
  return getDb().prepare('SELECT * FROM heartbeats WHERE service = ?').get(service);
}

/** Minutes since the last successful pass, or null when none recorded. */
function minutesSinceOk(service) {
  const hb = getHeartbeat(service);
  if (!hb || !hb.last_ok_at) return null;
  return (Date.now() - hb.last_ok_at) / 60000;
}

/** Minutes since the last staleness alert, or null when none sent. */
function minutesSinceAlert(service) {
  const hb = getHeartbeat(service);
  if (!hb || !hb.last_alert_at) return null;
  return (Date.now() - hb.last_alert_at) / 60000;
}

/** Remember that a staleness alert was just sent (for cooldown). */
function markAlerted(service) {
  getDb()
    .prepare(
      `INSERT INTO heartbeats (service, last_alert_at) VALUES (?, ?)
       ON CONFLICT(service) DO UPDATE SET last_alert_at = excluded.last_alert_at`
    )
    .run(service, Date.now());
}

module.exports = {
  recordError,
  recentErrors,
  beatOk,
  beatError,
  getHeartbeat,
  minutesSinceOk,
  minutesSinceAlert,
  markAlerted,
};
