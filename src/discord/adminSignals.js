'use strict';

/**
 * Admin text-input signal flow.
 *
 * In the configured admin channel, an analyst (with the admin role) types:
 *
 *   HAKA  BBRI            -> live "open" price, auto TP +N%, posts to #HAKA
 *   BSJP  BBCA            -> asks: pakai harga saat ini / tulis harga sendiri
 *   SNIPER BMRI           -> requires manual price (opens a modal)
 *   SWING ASII            -> requires manual price (opens a modal)
 *
 * Prices may also be given inline, e.g. `SNIPER BMRI 4200 4150 4100`.
 * TP is auto-computed at +N% above the average entry (config.signal.tpPercent),
 * unless an explicit TP is provided in the modal.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { resolveType } = require('../utils/signalTypes');
const { channelForType } = require('../notifier');
const { createAndBroadcast, createFromLivePrice } = require('./signalService');

const KEYWORDS = { HAKA: 'HAKA PREOPEN', SNIPER: 'SNIPER', BSJP: 'BSJP', SWING: 'SWING' };

/** Whether the member is allowed to create signals. */
function isAdmin(member) {
  const rid = config.discord.adminRoleId;
  if (!rid) return true; // gate is the admin channel when no role configured
  return Boolean(member && member.roles && member.roles.cache && member.roles.cache.has(rid));
}

/** Parse a price token; returns a positive number or null. */
function price(tok) {
  if (tok == null) return null;
  const t = String(tok).trim();
  if (t === '' || t === '-') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Build the confirmation message for a created signal. */
function confirm(signal, tpPercent) {
  const ch = channelForType(signal.type);
  const mention = ch ? `<#${ch}>` : '_(channel tipe belum diset)_';
  const entries =
    [signal.entry1, signal.entry2, signal.entry3].filter((v) => v != null).join(' | ') || '-';
  const tp = tpPercent != null ? `${signal.tp} (+${tpPercent}%)` : `${signal.tp}`;
  return `✅ **${signal.ticker}** · ${signal.type} → ${mention}\nEntry: ${entries} · AVG: ${signal.avg} · TP: ${tp}`;
}

/** Buttons for the BSJP price choice. */
function priceChoiceRow(type, ticker) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sig|now|${type}|${ticker}`)
      .setLabel('Harga saat ini')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sig|manual|${type}|${ticker}`)
      .setLabel('Tulis harga sendiri')
      .setStyle(ButtonStyle.Secondary)
  );
}

/** A single "isi harga" button (SNIPER/SWING require manual price). */
function manualRow(type, ticker) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sig|manual|${type}|${ticker}`)
      .setLabel('Isi Harga')
      .setStyle(ButtonStyle.Primary)
  );
}

/** The manual-price modal. */
function priceModal(type, ticker) {
  const field = (id, label, required) =>
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(required)
    );
  return new ModalBuilder()
    .setCustomId(`sigm|${type}|${ticker}`)
    .setTitle(`${ticker} · ${type}`)
    .addComponents(
      field('entry1', 'Harga Entry 1', true),
      field('entry2', 'Harga Entry 2 (opsional)', false),
      field('entry3', 'Harga Entry 3 (opsional)', false),
      field('tp', `TP harga (kosong = auto +${config.signal.tpPercent}%)`, false)
    );
}

/**
 * Handle a message in the admin channel.
 * @param {import('discord.js').Message} message
 */
async function handleMessage(message) {
  if (message.author.bot) return;
  const adminCh = config.discord.adminChannelId;
  if (!adminCh || message.channelId !== adminCh) return; // feature gated to the admin channel

  const tokens = message.content.trim().split(/\s+/);
  if (!tokens.length) return;

  // Resolve the leading keyword (supports "HAKA" or "HAKA PREOPEN").
  let idx = 1;
  let kw = tokens[0].toUpperCase();
  if (kw === 'HAKA' && (tokens[1] || '').toUpperCase() === 'PREOPEN') {
    kw = 'HAKA PREOPEN';
    idx = 2;
  }
  const type = KEYWORDS[kw] || (kw === 'HAKA PREOPEN' ? 'HAKA PREOPEN' : resolveType(kw));
  // Only react to messages that start with a signal keyword.
  if (!type || !(kw in KEYWORDS || kw === 'HAKA PREOPEN')) return;

  if (!isAdmin(message.member)) {
    await message.reply('Kamu tidak punya izin untuk membuat signal.').catch(() => {});
    return;
  }

  const ticker = (tokens[idx] || '').toUpperCase();
  if (!ticker) {
    await message.reply('Format: `<TIPE> <TICKER> [harga...]` — contoh: `HAKA BBRI`');
    return;
  }
  const entries = tokens.slice(idx + 1).map(price).filter((v) => v !== null);

  try {
    // Inline prices given -> create immediately for any type.
    if (entries.length) {
      const { signal, tpPercent } = await createAndBroadcast({ type, ticker, entries });
      await message.reply(confirm(signal, tpPercent));
      return;
    }

    if (type === 'HAKA PREOPEN') {
      // Auto: use the live open price.
      const { signal, tpPercent } = await createFromLivePrice({ type, ticker });
      await message.reply(confirm(signal, tpPercent));
      return;
    }

    if (type === 'BSJP') {
      await message.reply({
        content: `**${ticker}** · BSJP — pilih sumber harga:`,
        components: [priceChoiceRow(type, ticker)],
      });
      return;
    }

    // SNIPER / SWING require a manual price.
    await message.reply({
      content: `**${ticker}** · ${type} — harga wajib diisi:`,
      components: [manualRow(type, ticker)],
    });
  } catch (err) {
    console.error('[adminSignals] create failed:', err);
    await message.reply(`Gagal membuat signal: ${err.message}`).catch(() => {});
  }
}

/**
 * Handle button + modal interactions for the admin flow.
 * Returns true if the interaction was handled here.
 * @param {import('discord.js').Interaction} interaction
 * @returns {Promise<boolean>}
 */
async function handleInteraction(interaction) {
  // Buttons: sig|<action>|<type>|<ticker>
  if (interaction.isButton() && interaction.customId.startsWith('sig|')) {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: 'Kamu tidak punya izin.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const [, action, type, ticker] = interaction.customId.split('|');

    if (action === 'manual') {
      await interaction.showModal(priceModal(type, ticker));
      return true;
    }
    if (action === 'now') {
      await interaction.deferUpdate();
      try {
        const { signal, tpPercent } = await createFromLivePrice({ type, ticker });
        await interaction.editReply({ content: confirm(signal, tpPercent), components: [] });
      } catch (err) {
        await interaction.editReply({ content: `Gagal: ${err.message}`, components: [] });
      }
      return true;
    }
  }

  // Modal submit: sigm|<type>|<ticker>
  if (interaction.isModalSubmit() && interaction.customId.startsWith('sigm|')) {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: 'Kamu tidak punya izin.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const [, type, ticker] = interaction.customId.split('|');
    const e1 = price(interaction.fields.getTextInputValue('entry1'));
    const e2 = price(interaction.fields.getTextInputValue('entry2'));
    const e3 = price(interaction.fields.getTextInputValue('entry3'));
    const tp = price(interaction.fields.getTextInputValue('tp'));

    if (e1 === null) {
      await interaction.reply({ content: 'Harga Entry 1 harus angka positif.', flags: MessageFlags.Ephemeral });
      return true;
    }
    try {
      const { signal, tpPercent } = await createAndBroadcast({
        type,
        ticker,
        entries: [e1, e2, e3].filter((v) => v !== null),
        tp: tp ?? undefined,
      });
      await interaction.reply({ content: confirm(signal, tpPercent) });
      // Best-effort: disable the originating buttons.
      if (interaction.message) {
        await interaction.message.edit({ components: [] }).catch(() => {});
      }
    } catch (err) {
      await interaction.reply({ content: `Gagal: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  return false;
}

module.exports = { handleMessage, handleInteraction };
