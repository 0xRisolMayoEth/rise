'use strict';

/**
 * RISE Discord bot.
 *
 * Boots a discord.js v14 client, loads slash commands, and dispatches
 * interactions. The /signal command persists to SQLite (see
 * src/discord/commands/signal.js).
 *
 *   npm run bot
 */
const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database/db');
const { loadCommands } = require('./commands');
const adminSignals = require('./adminSignals');
const { createLogger } = require('../utils/logger');

const log = createLogger('bot');

function createClient() {
  const client = new Client({
    // Guilds for slash commands; GuildMessages + MessageContent for the admin
    // text flow (typing `HAKA BBRI`). MessageContent is a privileged intent —
    // enable it in the Discord Developer Portal.
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.commands = loadCommands();

  client.once(Events.ClientReady, (c) => {
    log.info(`Logged in as ${c.user.tag}`);
    log.info(`Loaded commands: ${[...client.commands.keys()].join(', ')}`);
    if (config.discord.adminChannelId) {
      log.info(`Admin signal channel: ${config.discord.adminChannelId}`);
    } else {
      log.warn('DISCORD_ADMIN_CHANNEL_ID not set — admin text flow disabled.');
    }
  });

  // Admin text flow: analysts typing signals in the admin channel.
  client.on(Events.MessageCreate, async (message) => {
    try {
      await adminSignals.handleMessage(message);
    } catch (err) {
      log.error('admin message error', { error: err.message });
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    // Buttons + modals from the admin flow.
    if (interaction.isButton() || interaction.isModalSubmit()) {
      try {
        await adminSignals.handleInteraction(interaction);
      } catch (err) {
        log.error('admin interaction error', { error: err.message });
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      log.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      log.error(`Error in /${interaction.commandName}`, { error: err.message });
      const payload = {
        content: 'Terjadi kesalahan saat menjalankan command.',
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });

  return client;
}

async function start() {
  if (!config.discord.token) {
    log.error('DISCORD_TOKEN is not set. See .env.example.');
    process.exit(1);
  }

  // Ensure the database/schema exists before accepting commands.
  getDb();

  const client = createClient();
  await client.login(config.discord.token);
  return client;
}

if (require.main === module) {
  start();
}

module.exports = { createClient, start };
