'use strict';

/**
 * Broadcasts a signal update to every configured platform.
 *
 * The tracker typically runs as its own process, so it posts to Discord via
 * the REST API (no gateway connection needed) rather than reusing a live bot
 * client. Telegram reuses the shared notifier helper.
 *
 * Each channel fails independently and never blocks the others.
 */
const { REST, Routes } = require('discord.js');
const config = require('../config');
const telegram = require('../telegram/bot');
const { formatSignal, asCodeBlock } = require('../utils/format');

let rest = null;
function getRest() {
  if (rest) return rest;
  if (!config.discord.token) return null;
  rest = new REST({ version: '10' }).setToken(config.discord.token);
  return rest;
}

/**
 * Post a message to the configured #signal-feed channel via REST.
 * No-op when Discord is not configured.
 * @param {string} content
 */
async function postDiscord(content) {
  const api = getRest();
  if (!api || !config.discord.signalChannelId) {
    console.warn('[notifier] Discord channel not configured — skipping.');
    return;
  }
  await api.post(Routes.channelMessages(config.discord.signalChannelId), {
    body: { content },
  });
}

/**
 * Broadcast a signal (in its current state) to Discord + Telegram.
 * @param {object} signal  A signal row.
 */
async function broadcastUpdate(signal) {
  const when = new Date(signal.updated_at || signal.created_at || Date.now());
  const text = asCodeBlock(formatSignal(signal, when));

  const results = await Promise.allSettled([
    postDiscord(text),
    telegram.broadcast(text),
  ]);

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[notifier] broadcast channel failed:', r.reason?.message || r.reason);
    }
  }
}

module.exports = { broadcastUpdate, postDiscord };
