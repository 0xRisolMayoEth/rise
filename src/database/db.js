'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

/**
 * Opens (and lazily initialises) the shared SQLite connection.
 * The same connection is reused across the whole process so that
 * the Discord bot, API, and tracker all read/write the same file.
 */
let db = null;

function getDb() {
  if (db) return db;

  // Make sure the data/ directory exists before opening the file.
  const dir = path.dirname(config.database.path);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(config.database.path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Apply the schema on first open — every statement is idempotent
  // (CREATE TABLE IF NOT EXISTS), so this is safe to run on every boot.
  const schema = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  );
  db.exec(schema);
  upgradeSignalsTable(db);

  return db;
}

/**
 * Upgrade pre-agent databases in place: the original `signals` table lacks
 * the sl/source/score columns and its status CHECK doesn't allow CUT LOSS.
 * SQLite can't alter CHECK constraints, so the table is rebuilt once (detected
 * by the missing `sl` column) and the rows copied over.
 * @param {import('better-sqlite3').Database} conn
 */
function upgradeSignalsTable(conn) {
  const cols = conn.pragma('table_info(signals)').map((c) => c.name);
  if (cols.includes('sl')) return;

  conn.pragma('foreign_keys = OFF');
  conn.exec(`
    BEGIN;
    CREATE TABLE signals_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('HAKA PREOPEN','SNIPER','BSJP','SWING')),
      entry1 REAL,
      entry2 REAL,
      entry3 REAL,
      avg REAL,
      tp REAL NOT NULL,
      sl REAL,
      status TEXT DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','TP1 HIT','DONE','CUT LOSS')),
      high REAL,
      profit_pct REAL,
      source TEXT DEFAULT 'manual' CHECK(source IN ('manual','agent')),
      score INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      closed_at TEXT
    );
    INSERT INTO signals_new (id, ticker, type, entry1, entry2, entry3, avg, tp,
                             status, high, profit_pct, created_at, updated_at, closed_at)
      SELECT id, ticker, type, entry1, entry2, entry3, avg, tp,
             status, high, profit_pct, created_at, updated_at, closed_at
        FROM signals;
    DROP TABLE signals;
    ALTER TABLE signals_new RENAME TO signals;
    CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
    CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
    COMMIT;
  `);
  conn.pragma('foreign_keys = ON');
}

module.exports = { getDb };
