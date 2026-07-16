'use strict';

/**
 * Trading agents — penjadwal cron pipeline sinyal otomatis.
 *
 * Jadwal (WIB, config.agents.*Cron; semua di-guard hari bursa):
 *   scan   07:15  scan universe -> kandidat harian
 *   HAKA   08:47  sesi pre-opening
 *   BSJP   15:25  menjelang close
 *   SWING  16:15  setelah close
 *   recap  17:00  performa + saran coach
 *
 * Dijalankan sebagai proses sendiri (PM2: rise-agents) atau one-shot:
 *   node src/agents/index.js                  -> scheduler (long-running)
 *   node src/agents/index.js scan|haka|bsjp|swing|recap
 */
const cron = require('node-cron');
const config = require('../config');
const { createLogger } = require('../utils/logger');
const orchestrator = require('./orchestrator');

const log = createLogger('agents');

/**
 * Schedule the whole pipeline. Returns the scheduled tasks.
 * @returns {import('node-cron').ScheduledTask[]}
 */
function start() {
  const tz = { timezone: config.timezone };
  const a = config.agents;

  const jobs = [
    [a.scanCron, 'scan', () => orchestrator.runScan()],
    [a.hakaCron, 'HAKA PREOPEN', () => orchestrator.runType('HAKA PREOPEN')],
    [a.bsjpCron, 'BSJP', () => orchestrator.runType('BSJP')],
    [a.swingCron, 'SWING', () => orchestrator.runType('SWING')],
    [a.recapCron, 'recap', () => orchestrator.runRecap()],
  ];

  const tasks = jobs.map(([expr, label, fn]) =>
    cron.schedule(expr, () => orchestrator.guarded(label, fn), tz)
  );

  log.info(
    `agents dijadwalkan: scan ${a.scanCron} · HAKA ${a.hakaCron} · ` +
      `BSJP ${a.bsjpCron} · SWING ${a.swingCron} · recap ${a.recapCron} (${config.timezone})`
  );
  return tasks;
}

/** Manual one-shot runs for testing/ops. */
async function runCommand(cmd) {
  switch ((cmd || '').toLowerCase()) {
    case 'scan':
      return orchestrator.runScan();
    case 'haka':
      return orchestrator.runType('HAKA PREOPEN');
    case 'bsjp':
      return orchestrator.runType('BSJP');
    case 'swing':
      return orchestrator.runType('SWING');
    case 'recap':
      return orchestrator.runRecap();
    default:
      throw new Error(`perintah tidak dikenal: ${cmd} (scan|haka|bsjp|swing|recap)`);
  }
}

if (require.main === module) {
  if (process.argv[2]) {
    // One-shot mode for testing/ops.
    runCommand(process.argv[2])
      .then((r) => {
        if (r) console.log(JSON.stringify(r, null, 2));
        process.exit(0);
      })
      .catch((e) => {
        console.error('[agents]', e.message);
        process.exit(1);
      });
  } else {
    // Long-running scheduler mode (PM2). Respects the .env master switch so
    // a stray `pm2 start` can't broadcast signals nobody asked for.
    if (!config.agents.enabled) {
      console.error('[agents] ENABLE_AGENTS bukan 1 di .env — scheduler tidak dijalankan.');
      process.exit(1);
    }
    require('../database/db').getDb();
    start();
  }
}

module.exports = { start, runCommand };
