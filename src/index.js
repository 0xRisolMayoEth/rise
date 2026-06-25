'use strict';

/**
 * RISE Signal System — main entrypoint.
 *
 * Boots the components for which credentials are configured. At minimum this
 * starts the Discord bot (the analyst's input surface). The API, Telegram
 * notifier, and price tracker come online as their config/dependencies land.
 *
 *   npm start
 */
const config = require('./config');
const { getDb } = require('./database/db');

async function main() {
  // Initialise the database/schema up front.
  getDb();
  console.log(`[rise] database ready at ${config.database.path}`);

  // Discord bot (required).
  if (config.discord.token) {
    const { start: startBot } = require('./discord/bot');
    await startBot();
  } else {
    console.warn('[rise] DISCORD_TOKEN not set — Discord bot not started.');
  }

  // Backend API (optional).
  if (process.env.ENABLE_API === '1') {
    require('./api/server').start();
  }
}

main().catch((err) => {
  console.error('[rise] fatal:', err);
  process.exit(1);
});
