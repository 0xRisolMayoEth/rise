'use strict';

/**
 * Seed fictitious sample signals for demos.
 *
 *   npm run seed            # append sample signals
 *   npm run seed -- --reset # clear signals first, then seed
 *
 * Signals are spread across periods (today / this week / this month / older)
 * and use only RUNNING and DONE statuses. Profit is derived from AVG and High
 * so the numbers stay internally consistent with the price tracker.
 */
const { getDb } = require('./db');

function avgOf(entries) {
  const nums = entries.filter((v) => v !== null && v !== undefined);
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}
function profitOf(avg, high) {
  if (!avg || high === null || high === undefined) return null;
  return Math.round(((high - avg) / avg) * 10000) / 100;
}

// [type, ticker, [entries], tp, status, high|null, daysAgo]
const SAMPLES = [
  // ── Today ────────────────────────────────────────────────
  ['HAKA PREOPEN', 'BBCA', [9000], 9250, 'RUNNING', 9100, 0],
  ['SNIPER', 'ANTM', [1500, 1480, 1460], 1560, 'RUNNING', 1525, 0],
  ['BSJP', 'PYFA', [193], 199, 'DONE', 198, 0],
  // ── This week ────────────────────────────────────────────
  ['BSJP', 'GOTO', [82, 80, 78], 90, 'RUNNING', 85, 1],
  ['SWING', 'ADRO', [2800, 2750], 2950, 'RUNNING', 2860, 2],
  ['BSJP', 'TRUE', [56], 58, 'DONE', 59, 1],
  ['BSJP', 'SCMA', [214], 222, 'DONE', 222, 2],
  ['SNIPER', 'BBRI', [4200, 4150], 4400, 'DONE', 4420, 3],
  ['HAKA PREOPEN', 'BMRI', [6000], 6300, 'DONE', 6320, 4],
  ['BSJP', 'RGAS', [1200], 1260, 'DONE', 1255, 5],
  ['SWING', 'ASII', [5000], 5300, 'DONE', 5350, 6],
  ['BSJP', 'YOII', [400], 416, 'DONE', 420, 6],
  // ── Earlier this month ───────────────────────────────────
  ['SNIPER', 'MEDC', [1100, 1080], 1200, 'DONE', 1150, 7],
  ['BSJP', 'MEDS', [3000], 3120, 'DONE', 3140, 8],
  ['SWING', 'PTBA', [2500], 2650, 'DONE', 2680, 9],
  ['HAKA PREOPEN', 'ICBP', [11000], 11400, 'DONE', 11450, 10],
  ['SNIPER', 'BUKA', [200, 195], 215, 'DONE', 192, 11], // loss
  ['SNIPER', 'ITMG', [25000, 24800], 26000, 'DONE', 26200, 12],
  ['SWING', 'INKP', [7000], 7400, 'DONE', 6850, 13], // loss
  ['SWING', 'KLBF', [1600], 1700, 'DONE', 1710, 14],
  // ── Older (last month) ───────────────────────────────────
  ['BSJP', 'EMTK', [450], 468, 'DONE', 470, 30],
  ['BSJP', 'ARTO', [2800], 2920, 'DONE', 2950, 33],
  ['HAKA PREOPEN', 'UNVR', [3500], 3650, 'DONE', 3680, 36],
  ['SNIPER', 'CPIN', [4800, 4750], 5000, 'DONE', 5050, 40],
  ['SWING', 'TINS', [900], 960, 'DONE', 975, 45],
];

function run() {
  const db = getDb();
  const reset = process.argv.includes('--reset');

  if (reset) {
    db.exec('DELETE FROM signal_updates; DELETE FROM signals;');
    try {
      db.exec("DELETE FROM sqlite_sequence WHERE name IN ('signals','signal_updates')");
    } catch (_) { /* sqlite_sequence may not exist yet */ }
    console.log('[seed] Cleared existing signals.');
  }

  // Compute a localtime timestamp N days (and a few hours) ago.
  const tsAt = db.prepare("SELECT datetime('now','localtime', ?, ?) AS t");
  const at = (days, hours) => tsAt.get(`-${days} days`, `-${hours} hours`).t;

  const insert = db.prepare(`
    INSERT INTO signals
      (ticker, type, entry1, entry2, entry3, avg, tp, status, high, profit_pct, created_at, updated_at, closed_at)
    VALUES
      (@ticker, @type, @e1, @e2, @e3, @avg, @tp, @status, @high, @profit, @created, @created, @closed)
  `);
  const logUpdate = db.prepare(
    'INSERT INTO signal_updates (signal_id, status, note, created_at) VALUES (?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    for (const [type, ticker, entries, tp, status, high, days] of SAMPLES) {
      const [e1 = null, e2 = null, e3 = null] = entries;
      const avg = avgOf(entries);
      const done = status === 'DONE';
      const created = at(days, 5);
      const closed = done ? at(days, 2) : null;
      const profit = done ? profitOf(avg, high) : null;

      const info = insert.run({
        ticker, type, e1, e2, e3, avg, tp, status,
        high: status === 'RUNNING' ? high ?? null : high,
        profit, created, closed,
      });
      const id = info.lastInsertRowid;
      logUpdate.run(id, 'RUNNING', 'Signal created (seed)', created);
      if (done) logUpdate.run(id, 'DONE', 'Closed (seed)', closed);
    }
  });

  tx();
  const total = db.prepare('SELECT COUNT(*) AS n FROM signals').get().n;
  console.log(`[seed] Inserted ${SAMPLES.length} sample signals (total now ${total}).`);
}

if (require.main === module) run();

module.exports = { run, SAMPLES };
