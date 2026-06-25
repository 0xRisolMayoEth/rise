-- RISE Signal System — SQLite schema
-- All timestamps stored as local time (WIB) text via datetime('now','localtime').

-- Tabel utama signal
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('HAKA PREOPEN','SNIPER','BSJP','SWING')),
  entry1 REAL,
  entry2 REAL,
  entry3 REAL,
  avg REAL,
  tp REAL NOT NULL,
  status TEXT DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','TP1 HIT','DONE')),
  high REAL,
  profit_pct REAL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  closed_at TEXT
);

-- Log perubahan status
CREATE TABLE IF NOT EXISTS signal_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER NOT NULL REFERENCES signals(id),
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- User/analis
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'analyst',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Konfigurasi
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Helpful indexes for the dashboard / API queries.
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
CREATE INDEX IF NOT EXISTS idx_signal_updates_signal_id ON signal_updates(signal_id);
