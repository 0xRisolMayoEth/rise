'use strict';

/**
 * Shared multi-platform broadcaster.
 *
 * One place that renders a signal into the canonical ASCII block and pushes it
 * to the configured platforms. Used by:
 *   - the /signal command (NEW SIGNAL — Telegram fan-out; Discord is covered by
 *     the interaction reply, or the feed channel when it differs);
 *   - the price tracker (status changes — Discord feed via REST + Telegram).
 *
 * Discord posts use the REST API so callers don't need a live gateway client.
 * Each channel fails independently and never blocks the others.
 */
const { REST, Routes } = require('discord.js');
const config = require('./config');
const telegramBot = require('./telegram/bot');
const { formatSignal, formatDone, asCodeBlock } = require('./utils/format');

let rest = null;
function getRest() {
  if (rest) return rest;
  if (!config.discord.token) return null;
  rest = new REST({ version: '10' }).setToken(config.discord.token);
  return rest;
}

/**
 * Resolve the Discord channel a signal type should be posted to.
 * Falls back to the generic feed channel when the per-type one is unset.
 * @param {string} [type]
 * @returns {string} channel id (may be empty)
 */
function channelForType(type) {
  return (
    (type && config.discord.channels && config.discord.channels[type]) ||
    config.discord.signalChannelId ||
    ''
  );
}

/**
 * Post a message to a Discord channel via REST.
 * No-op when Discord (token or channel) is not configured.
 * @param {string} content
 * @param {string} [channelId]  Defaults to the generic feed channel.
 */
async function toDiscordChannel(content, channelId = config.discord.signalChannelId) {
  const api = getRest();
  if (!api || !channelId) {
    console.warn('[notifier] Discord channel not configured — skipping.');
    return;
  }
  await api.post(Routes.channelMessages(channelId), { body: { content } });
}

/**
 * Send a message to the Telegram channel. No-op when not configured.
 * @param {string} content
 */
async function toTelegram(content) {
  return telegramBot.broadcast(content);
}

/**
 * Render a signal and broadcast it to the selected platforms.
 *
 * @param {object} signal                       A signal row.
 * @param {object} [channels]
 * @param {boolean} [channels.discord=true]     Post to the Discord feed channel.
 * @param {boolean} [channels.telegram=true]    Post to Telegram.
 * @returns {Promise<string>} the rendered text block.
 */
async function broadcastSignal(signal, channels = {}) {
  const { discord = true, telegram = true } = channels;
  const when = new Date(signal.updated_at || signal.created_at || Date.now());
  const text = asCodeBlock(formatSignal(signal, when));

  const tasks = [];
  if (discord) tasks.push(['discord', toDiscordChannel(text, channelForType(signal.type))]);
  if (telegram) tasks.push(['telegram', toTelegram(text)]);

  // When a signal is DONE, also announce it in the "information done" channel
  // with the source (type), entry date, and done date.
  if (discord && signal.status === 'DONE' && config.discord.doneChannelId) {
    const doneText = asCodeBlock(formatDone(signal));
    tasks.push(['done', toDiscordChannel(doneText, config.discord.doneChannelId)]);
  }

  const results = await Promise.allSettled(tasks.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(
        `[notifier] ${tasks[i][0]} failed:`,
        r.reason?.message || r.reason
      );
    }
  });

  return text;
}

module.exports = { broadcastSignal, toDiscordChannel, toTelegram, channelForType };
