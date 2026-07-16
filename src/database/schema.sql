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

-- Kandidat hasil scan harian pipeline agent (Market Scanner + Technical
-- Analyst). Satu baris per ticker per hari bursa; runs per tipe membaca dari
-- sini agar scan berat cukup sekali sehari.
CREATE TABLE IF NOT EXISTS agent_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_date TEXT NOT NULL,            -- YYYY-MM-DD (WIB)
  ticker TEXT NOT NULL,
  score INTEGER NOT NULL,
  last REAL,                          -- harga close saat scan
  support1 REAL,
  support2 REAL,
  resistance REAL,
  metrics TEXT,                       -- JSON: indikator & alasan skor
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(scan_date, ticker)
);

-- Persisted errors — written automatically by the logger's error level so
-- failures survive log rotation and are queryable from the API/dashboard.
CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Per-service heartbeats (one row per service). Timestamps are epoch
-- milliseconds so staleness math never depends on the server timezone.
CREATE TABLE IF NOT EXISTS heartbeats (
  service TEXT PRIMARY KEY,
  last_ok_at INTEGER,
  last_error_at INTEGER,
  last_error TEXT,
  last_alert_at INTEGER,
  ok_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0
);

-- Helpful indexes for the dashboard / API queries.
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(type);
CREATE INDEX IF NOT EXISTS idx_agent_candidates_date ON agent_candidates(scan_date, score);
CREATE INDEX IF NOT EXISTS idx_signal_updates_signal_id ON signal_updates(signal_id);
CREATE INDEX IF NOT EXISTS idx_errors_service_created ON errors(service, created_at);
