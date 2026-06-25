'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createSignal } = require('../../models/signal');
const { resolveType, TYPE_CHOICES } = require('../../utils/signalTypes');
const { formatSignal, asCodeBlock } = require('../../utils/format');

/**
 * Parse a price option. Accepts "-" / empty as "no value" (null).
 * Returns { value } on success or { error } on an unparseable number.
 */
function parsePrice(raw, label) {
  if (raw === null || raw === undefined) return { value: null };
  const trimmed = String(raw).trim();
  if (trimmed === '' || trimmed === '-') return { value: null };
  const n = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    return { error: `\`${label}\` harus berupa angka positif (atau \`-\`).` };
  }
  return { value: n };
}

/**
 * /signal <type> <ticker> <entry1> <entry2> <entry3> <tp>
 *
 * Mirrors the analyst input format from CLAUDE.md. Persists a RUNNING
 * signal to SQLite and replies with the canonical ASCII block.
 */
const data = new SlashCommandBuilder()
  .setName('signal')
  .setDescription('Buat signal baru (RUNNING) dan simpan ke database')
  .addStringOption((o) =>
    o
      .setName('tipe')
      .setDescription('Tipe signal')
      .setRequired(true)
      .addChoices(...TYPE_CHOICES)
  )
  .addStringOption((o) =>
    o
      .setName('ticker')
      .setDescription('Kode saham, contoh: SCMA')
      .setRequired(true)
      .setMaxLength(10)
  )
  .addStringOption((o) =>
    o
      .setName('entry1')
      .setDescription('Harga entry 1 (atau "-" jika tidak ada)')
      .setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('entry2').setDescription('Harga entry 2 (atau "-")').setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('entry3').setDescription('Harga entry 3 (atau "-")').setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('tp').setDescription('Target profit (harga, bukan %)').setRequired(true)
  );

async function execute(interaction) {
  const typeInput = interaction.options.getString('tipe');
  const ticker = interaction.options.getString('ticker').trim().toUpperCase();

  const type = resolveType(typeInput);
  if (!type) {
    return interaction.reply({
      content: `Tipe tidak valid: \`${typeInput}\`. Pilih HAKA / SNIPER / BSJP / SWING.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Parse all price fields, collecting any validation error.
  const e1 = parsePrice(interaction.options.getString('entry1'), 'entry1');
  const e2 = parsePrice(interaction.options.getString('entry2'), 'entry2');
  const e3 = parsePrice(interaction.options.getString('entry3'), 'entry3');
  const tp = parsePrice(interaction.options.getString('tp'), 'tp');

  const err = [e1, e2, e3, tp].find((r) => r.error);
  if (err) {
    return interaction.reply({ content: err.error, flags: MessageFlags.Ephemeral });
  }
  if (tp.value === null) {
    return interaction.reply({
      content: '`tp` wajib diisi dengan harga target.',
      flags: MessageFlags.Ephemeral,
    });
  }

  let signal;
  try {
    signal = createSignal({
      ticker,
      type,
      entry1: e1.value,
      entry2: e2.value,
      entry3: e3.value,
      tp: tp.value,
    });
  } catch (e) {
    console.error('[signal] failed to save signal:', e);
    return interaction.reply({
      content: 'Gagal menyimpan signal ke database. Coba lagi.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const block = asCodeBlock(formatSignal(signal, new Date(signal.created_at)));
  return interaction.reply({ content: block });
}

module.exports = { data, execute };
