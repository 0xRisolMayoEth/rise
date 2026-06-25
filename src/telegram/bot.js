'use strict';

/**
 * Telegram bot — notification only (per CLAUDE.md, Telegram never accepts input).
 *
 * Scaffold: exposes a `broadcast(text)` helper that other parts of the
 * system call to push the formatted signal block to @signal_alerts.
 * Implement with node-telegram-bot-api when TELEGRAM_TOKEN is configured.
 */
const config = require('../config');

let bot = null;

function getBot() {
  if (bot) return bot;
  if (!config.telegram.token) return null;

  // Lazy-require so the dependency is optional during early development.
  // eslint-disable-next-line global-require
  const TelegramBot = require('node-telegram-bot-api');
  bot = new TelegramBot(config.telegram.token, { polling: false });
  return bot;
}

/**
 * Send a formatted signal (already wrapped in a code block) to the channel.
 * No-op when Telegram is not configured.
 * @param {string} text
 */
async function broadcast(text) {
  const b = getBot();
  if (!b || !config.telegram.chatId) {
    console.warn('[telegram] not configured — skipping broadcast.');
    return;
  }
  await b.sendMessage(config.telegram.chatId, text, { parse_mode: 'Markdown' });
}

module.exports = { broadcast };
