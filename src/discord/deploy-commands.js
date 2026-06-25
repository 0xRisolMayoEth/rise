'use strict';

/**
 * Register slash commands with Discord.
 *
 *   npm run deploy-commands
 *
 * If DISCORD_GUILD_ID is set, commands are deployed to that guild and appear
 * instantly (best for development). Otherwise they are deployed globally,
 * which can take up to an hour to propagate.
 */
const { REST, Routes } = require('discord.js');
const config = require('../config');
const { loadCommands } = require('./commands');

async function deploy() {
  if (!config.discord.token || !config.discord.clientId) {
    console.error(
      '[deploy] DISCORD_TOKEN and DISCORD_CLIENT_ID are required. See .env.example.'
    );
    process.exit(1);
  }

  const commands = [...loadCommands().values()].map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.discord.token);

  try {
    if (config.discord.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(
          config.discord.clientId,
          config.discord.guildId
        ),
        { body: commands }
      );
      console.log(
        `[deploy] Registered ${commands.length} guild command(s) to ${config.discord.guildId}.`
      );
    } else {
      await rest.put(Routes.applicationCommands(config.discord.clientId), {
        body: commands,
      });
      console.log(
        `[deploy] Registered ${commands.length} global command(s) (may take up to 1h).`
      );
    }
  } catch (err) {
    console.error('[deploy] Failed to register commands:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  deploy();
}

module.exports = { deploy };
