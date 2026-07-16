'use strict';

/**
 * Telegram bot — notification only.
 *
 * Per CLAUDE.md, Telegram never accepts input; it just mirrors the formatted
 * signal blocks to @signal_alerts. This module exposes a `broadcast(text)`
 * helper (used by src/notifier.js) plus a `verify()` connectivity check.
 *
 * The bot is created with polling disabled — we only ever send messages.
 */
const config = require('../config');
const { createLogger } = require('../utils/logger');

const log = createLogger('telegram');

let bot = null;

/**
 * Lazily create the (send-only) Telegram client, or null when unconfigured.
 * @returns {import('node-telegram-bot-api')|null}
 */
function getBot() {
  if (bot) return bot;
  if (!config.telegram.token) return null;

  // Lazy-require so the dependency stays optional.
  // eslint-disable-next-line global-require
  const TelegramBot = require('node-telegram-bot-api');
  bot = new TelegramBot(config.telegram.token, { polling: false });
  return bot;
}

/**
 * Whether Telegram is fully configured (token + target chat).
 * @returns {boolean}
 */
function isConfigured() {
  return Boolean(config.telegram.token && config.telegram.chatId);
}

/**
 * Send a message to the configured channel. No-op when not configured.
 *
 * The signal block is already wrapped in a ``` ``` ``` fence, so legacy
 * Markdown renders it as a monospace preformatted block. We fall back to a
 * plain (unparsed) send if Telegram rejects the Markdown — that way a stray
 * special character can never silently drop a notification.
 *
 * @param {string} text
 * @returns {Promise<void>}
 */
async function broadcast(text) {
  const b = getBot();
  if (!b || !config.telegram.chatId) {
    log.warn('not configured — skipping broadcast.');
    return;
  }

  try {
    await b.sendMessage(config.telegram.chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    log.warn(`Markdown send failed; retrying as plain text`, { error: err.message });
    await b.sendMessage(config.telegram.chatId, text);
  }
}

/**
 * Verify the token by calling getMe. Resolves with the bot info, or throws.
 * @returns {Promise<object>}
 */
async function verify() {
  const b = getBot();
  if (!b) throw new Error('TELEGRAM_TOKEN is not set');
  return b.getMe();
}

module.exports = { getBot, isConfigured, broadcast, verify };
