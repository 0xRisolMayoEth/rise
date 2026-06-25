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

  return db;
}

module.exports = { getDb };
