'use strict';

/**
 * Backend API (Express.js) — serves signal data to the website/dashboard.
 *
 * Read-only over the same SQLite database the Discord bot writes to.
 * Endpoints:
 *   GET /api/health
 *   GET /api/signals?status&type&limit&offset
 *   GET /api/signals/:id
 *   GET /api/signals/:id/updates
 *   GET /api/stats
 *   GET /api/calendar?month=YYYY-MM
 *
 *   npm run api
 */
const path = require('path');
const config = require('../config');
const { getDb } = require('../database/db');

function createServer() {
  // Lazy-require so express stays optional until the API is needed.
  // eslint-disable-next-line global-require
  const express = require('express');
  const app = express();

  app.use(express.json());

  // Lightweight request logger.
  app.use((req, _res, next) => {
    console.log(`[api] ${req.method} ${req.originalUrl}`);
    next();
  });

  // Serve the (placeholder) static website.
  app.use(express.static(path.join(config.root, 'public')));

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // Feature routers.
  app.use('/api/signals', require('./routes/signals'));
  app.use('/api', require('./routes/stats'));

  // 404 for unmatched /api routes.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  // Centralised error handler. Routes throw errors with an optional
  // `.status`; everything else becomes a 500.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error('[api] error:', err);
    res.status(status).json({ error: err.message || 'internal error' });
  });

  return app;
}

function start() {
  // Ensure the database/schema exists before serving.
  getDb();
  const app = createServer();
  return app.listen(config.api.port, () => {
    console.log(`[api] Listening on http://localhost:${config.api.port}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { createServer, start };
