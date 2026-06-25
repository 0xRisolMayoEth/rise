'use strict';

/**
 * Stand-alone migration runner.
 * Applies schema.sql against the configured database file.
 *
 *   npm run migrate
 */
const { getDb } = require('./db');
const config = require('../config');

function migrate() {
  // Simply opening the connection applies schema.sql (idempotently).
  getDb();
  console.log(`[migrate] Schema applied to ${config.database.path}`);
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
