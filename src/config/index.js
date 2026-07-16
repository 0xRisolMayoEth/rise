'use strict';

require('dotenv').config();

const path = require('path');

/**
 * Centralised configuration loaded from environment variables.
 * Anything platform-wide should be read from here rather than
 * touching process.env directly.
 */
const ROOT = path.resolve(__dirname, '..', '..');

/** Number from env, falling back when unset/blank/NaN (0 stays valid). */
function numberOr(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Boolean from env ("0"/"false"/"no"/"off" are false), with a default. */
function boolOr(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
}

const priceSource = process.env.PRICE_SOURCE || 'mock';

const config = {
  root: ROOT,

  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    signalChannelId: process.env.DISCORD_SIGNAL_CHANNEL_ID || '',
    // Per-type broadcast channels (keyed by the canonical DB type).
    channels: {
      'HAKA PREOPEN': process.env.DISCORD_HAKA_CHANNEL_ID || '',
      SNIPER: process.env.DISCORD_SNIPER_CHANNEL_ID || '',
      BSJP: process.env.DISCORD_BSJP_CHANNEL_ID || '',
      SWING: process.env.DISCORD_SWING_CHANNEL_ID || '',
    },
    // Admin text-input flow: the channel analysts type signals in, and the
    // role allowed to create signals.
    adminChannelId: process.env.DISCORD_ADMIN_CHANNEL_ID || '',
    adminRoleId: process.env.DISCORD_ADMIN_ROLE_ID || '',
    // "Information done" channel — DONE announcements are posted here.
    doneChannelId: process.env.DISCORD_DONE_CHANNEL_ID || '',
  },

  signal: {
    // Auto take-profit percentage above the average entry (e.g. 3 => +3%).
    tpPercent: Number(process.env.SIGNAL_TP_PERCENT) || 3,
  },

  telegram: {
    token: process.env.TELEGRAM_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },

  database: {
    // Resolve relative paths against the project root so the bot can be
    // started from any working directory.
    path: path.isAbsolute(process.env.DATABASE_PATH || '')
      ? process.env.DATABASE_PATH
      : path.join(ROOT, process.env.DATABASE_PATH || 'data/db.sqlite3'),
  },

  api: {
    port: Number(process.env.API_PORT) || 3000,
  },

  tracker: {
    // Which price source to use: 'mock' (no network, for dev) or 'idx'.
    source: priceSource,
    // Cron schedule for the tracking pass. Default: every minute.
    cron: process.env.TRACKER_CRON || '* * * * *',
    // IDX/quote endpoint template; "{ticker}" is replaced per request.
    idxUrl:
      process.env.IDX_API_URL ||
      'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}.JK',
    // Pause between quote requests within a pass (rate-limit friendliness).
    fetchDelayMs: numberOr(process.env.TRACKER_FETCH_DELAY_MS, 250),
    // Only run passes during IDX trading sessions. Defaults on for the live
    // source; the mock source keeps running around the clock for dev.
    marketHoursOnly: boolOr(
      process.env.TRACKER_MARKET_HOURS_ONLY,
      priceSource === 'idx'
    ),
    // Admin alert when no successful pass for this many minutes while the
    // market is open (0 = disabled), and the cooldown between alerts.
    staleAlertMin: numberOr(process.env.TRACKER_STALE_ALERT_MIN, 15),
    alertCooldownMin: numberOr(process.env.TRACKER_ALERT_COOLDOWN_MIN, 60),
  },

  agents: {
    // Master switch for the automated signal pipeline (ENABLE_AGENTS=1).
    enabled: boolOr(process.env.ENABLE_AGENTS, false),

    // Portfolio Manager: virtual capital and allocation limits.
    capital: numberOr(process.env.AGENT_CAPITAL, 100_000_000),
    maxPositionPct: numberOr(process.env.AGENT_MAX_POSITION_PCT, 5),
    maxOpenPositions: numberOr(process.env.AGENT_MAX_OPEN_POSITIONS, 30),
    maxSignalsPerRun: numberOr(process.env.AGENT_MAX_SIGNALS_PER_RUN, 2),

    // Technical Analyst: minimum score (0-100) to qualify as a candidate.
    // Deliberately strict — only A+ setups pass; lower it for more signals.
    minScore: numberOr(process.env.AGENT_MIN_SCORE, 85),

    // Market-regime gate: skip signal runs when the IHSG is bearish
    // (below its EMA20 or dropping hard today).
    regime: {
      enabled: boolOr(process.env.AGENT_REGIME_FILTER, true),
      // Skip runs when the index is down more than this % on the day.
      maxDailyDrop: numberOr(process.env.AGENT_REGIME_MAX_DROP, 1),
      indexUrl:
        process.env.AGENT_INDEX_URL ||
        'https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE',
    },

    // Risk Manager: TP/SL percentages per signal type (from the entry AVG).
    // No time stop — a RUNNING signal stays RUNNING until TP/SL is touched.
    types: {
      'HAKA PREOPEN': {
        tp: numberOr(process.env.AGENT_TP_HAKA, 3),
        sl: numberOr(process.env.AGENT_SL_HAKA, 10),
      },
      BSJP: {
        tp: numberOr(process.env.AGENT_TP_BSJP, 3),
        sl: numberOr(process.env.AGENT_SL_BSJP, 10),
      },
      SWING: {
        tp: numberOr(process.env.AGENT_TP_SWING, 10),
        sl: numberOr(process.env.AGENT_SL_SWING, 30),
      },
    },

    // Schedules (WIB via cron timezone; trading days only — holidays are
    // filtered at runtime with isTradingDay()).
    scanCron: process.env.AGENT_SCAN_CRON || '15 7 * * 1-5',
    hakaCron: process.env.AGENT_HAKA_CRON || '47 8 * * 1-5',
    bsjpCron: process.env.AGENT_BSJP_CRON || '25 15 * * 1-5',
    swingCron: process.env.AGENT_SWING_CRON || '15 16 * * 1-5',
    recapCron: process.env.AGENT_RECAP_CRON || '0 17 * * 1-5',

    // Market Scanner filters.
    universePath: path.isAbsolute(process.env.AGENT_UNIVERSE_PATH || '')
      ? process.env.AGENT_UNIVERSE_PATH
      : path.join(ROOT, process.env.AGENT_UNIVERSE_PATH || 'src/config/idx-tickers.json'),
    historyRange: process.env.AGENT_HISTORY_RANGE || '3mo',
    minPrice: numberOr(process.env.AGENT_MIN_PRICE, 60),
    // Minimum median daily transaction value (price × volume), in IDR.
    minValue: numberOr(process.env.AGENT_MIN_VALUE, 1_000_000_000),
    // Last-day volume must be at least this multiple of the 20-day average.
    volumeSpike: numberOr(process.env.AGENT_VOLUME_SPIKE, 1.5),
    // Pause between history/quote requests during a scan.
    fetchDelayMs: numberOr(process.env.AGENT_FETCH_DELAY_MS, 300),
  },

  logging: {
    // debug | info | warn | error
    level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
    dir: path.join(ROOT, 'logs'),
  },

  // All times across the system use WIB (UTC+7).
  timezone: process.env.TZ || 'Asia/Jakarta',
};

module.exports = config;
