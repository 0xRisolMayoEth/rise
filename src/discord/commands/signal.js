'use strict';
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../../config');
const { createSignal } = require('../../models/signal');
const { resolveType, TYPE_CHOICES } = require('../../utils/signalTypes');
const { formatSignal, asCodeBlock } = require('../../utils/format');
const { broadcastSignal } = require('../../notifier');

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

const data = new SlashCommandBuilder()
  .setName('signal')
  .setDescription('Buat signal baru (RUNNING) dan simpan ke database')
  .addStringOption((o) =>
    o.setName('tipe').setDescription('Tipe signal').setRequired(true).addChoices(...TYPE_CHOICES)
  )
  .addStringOption((o) =>
    o.setName('ticker').setDescription('Kode saham, contoh: SCMA').setRequired(true).setMaxLength(10)
  )
  .addStringOption((o) =>
    o.setName('entry1').setDescription('Harga entry 1 (atau "-" jika tidak ada)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('tp').setDescription('Target profit (harga, bukan %)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('entry2').setDescription('Harga entry 2 (atau "-")').setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('entry3').setDescription('Harga entry 3 (atau "-")').setRequired(false)
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
  await interaction.reply({ content: block });

  // Fan out NEW SIGNAL to the other platforms. The reply above already posts
  // to this Discord channel, so only re-post to the feed channel when it's a
  // different one. Telegram always gets it. Best-effort — never blocks the reply.
  const feedElsewhere =
    Boolean(config.discord.signalChannelId) &&
    config.discord.signalChannelId !== interaction.channelId;
  broadcastSignal(signal, { discord: feedElsewhere, telegram: true }).catch((e) =>
    console.error('[signal] broadcast failed:', e.message)
  );

  return undefined;
}

module.exports = { data, execute };
