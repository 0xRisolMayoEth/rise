'use strict';

/**
 * Telegram entrypoint — connectivity check / manual test send.
 *
 *   npm run telegram            # verify the token and report the bot identity
 *   npm run telegram -- "text"  # also send "text" to the configured channel
 *
 * Telegram is notification-only, so there is no long-running process here;
 * the live notifications are pushed by src/notifier.js from the bot/tracker.
 */
const config = require('../config');
const { verify, broadcast, isConfigured } = require('./bot');

async function main() {
  if (!config.telegram.token) {
    console.error('[telegram] TELEGRAM_TOKEN is not set. See .env.example.');
    process.exit(1);
  }

  try {
    const me = await verify();
    console.log(`[telegram] Connected as @${me.username} (${me.id}).`);
  } catch (err) {
    console.error('[telegram] Verification failed:', err.message);
    process.exit(1);
  }

  if (!config.telegram.chatId) {
    console.warn('[telegram] TELEGRAM_CHAT_ID is not set — cannot send messages.');
    return;
  }

  // Anything after `--` becomes a test message.
  const message = process.argv.slice(2).join(' ').trim();
  if (message) {
    await broadcast('```\n' + message + '\n```');
    console.log(`[telegram] Sent test message to ${config.telegram.chatId}.`);
  } else {
    console.log(
      `[telegram] Ready (configured=${isConfigured()}). ` +
        'Pass a message to send a test: npm run telegram -- "hello".'
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
