'use strict';

/**
 * Structured logger (JSON lines) shared by every service.
 *
 * createLogger('tracker') returns { debug, info, warn, error }. Each call
 * appends one JSON line to logs/<service>.log (rotated at ~5 MB with one
 * backup) and mirrors a human-readable line to the console so the systemd
 * journal stays useful. `error` additionally persists the entry to the
 * `errors` table so failures survive log rotation and can be queried from
 * the dashboard/API.
 *
 * Levels: debug < info < warn < error. Threshold comes from LOG_LEVEL
 * (default: info).
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_BYTES = 5 * 1024 * 1024;

function threshold() {
  return LEVELS[config.logging.level] || LEVELS.info;
}

/** Make a context object safe to serialise (Error objects lose their message otherwise). */
function normalizeCtx(ctx) {
  if (ctx instanceof Error) return { error: ctx.message };
  if (ctx && typeof ctx === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(ctx)) {
      out[k] = v instanceof Error ? v.message : v;
    }
    return out;
  }
  return ctx;
}

function rotateIfNeeded(file) {
  try {
    if (fs.statSync(file).size >= MAX_BYTES) fs.renameSync(file, `${file}.1`);
  } catch {
    // File does not exist yet — nothing to rotate.
  }
}

function writeLine(service, entry) {
  try {
    fs.mkdirSync(config.logging.dir, { recursive: true });
    const file = path.join(config.logging.dir, `${service}.log`);
    rotateIfNeeded(file);
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch (e) {
    // Logging must never take a service down.
    console.error(`[logger] write failed: ${e.message}`);
  }
}

function log(service, level, message, ctx) {
  if (LEVELS[level] < threshold()) return;

  const entry = { ts: new Date().toISOString(), service, level, message };
  const normCtx = ctx === undefined ? undefined : normalizeCtx(ctx);
  if (normCtx !== undefined) entry.ctx = normCtx;
  writeLine(service, entry);

  let suffix = '';
  if (normCtx !== undefined) {
    try {
      suffix = ` ${JSON.stringify(normCtx)}`;
    } catch {
      suffix = '';
    }
  }
  const line = `[${service}] ${message}${suffix}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  if (level === 'error') {
    try {
      // Lazy require: keeps DB access out of the logger's module graph.
      const { recordError } = require('../models/ops');
      recordError(service, message, normCtx);
    } catch (e) {
      console.error(`[logger] error persistence failed: ${e.message}`);
    }
  }
}

/**
 * @param {string} service  Short service name; becomes the log file name.
 */
function createLogger(service) {
  return {
    debug: (msg, ctx) => log(service, 'debug', msg, ctx),
    info: (msg, ctx) => log(service, 'info', msg, ctx),
    warn: (msg, ctx) => log(service, 'warn', msg, ctx),
    error: (msg, ctx) => log(service, 'error', msg, ctx),
  };
}

module.exports = { createLogger };
