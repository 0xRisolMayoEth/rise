'use strict';

require('dotenv').config();

const path = require('path');

/**
 * Centralised configuration loaded from environment variables.
 * Anything platform-wide should be read from here rather than
 * touching process.env directly.
 */
const ROOT = path.resolve(__dirname, '..', '..');

const config = {
  root: ROOT,

  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    signalChannelId: process.env.DISCORD_SIGNAL_CHANNEL_ID || '',
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
    source: process.env.PRICE_SOURCE || 'mock',
    // Cron schedule for the tracking pass. Default: every minute.
    cron: process.env.TRACKER_CRON || '* * * * *',
    // IDX/quote endpoint template; "{ticker}" is replaced per request.
    idxUrl:
      process.env.IDX_API_URL ||
      'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}.JK',
    // Auto-close RUNNING signals older than this many days (0 = disabled).
    maxAgeDays: Number(process.env.TRACKER_MAX_AGE_DAYS) || 0,
  },

  // All times across the system use WIB (UTC+7).
  timezone: process.env.TZ || 'Asia/Jakarta',
};

module.exports = config;
