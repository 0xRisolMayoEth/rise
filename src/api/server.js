'use strict';

/**
 * Backend API (Express.js) — serves signal data to the website/dashboard.
 *
 * Scaffold with read endpoints backed by the same SQLite database the
 * Discord bot writes to. Extend as the website prototype is wired up.
 *
 *   npm run api
 */
const path = require('path');
const config = require('../config');
const { listSignals, getSignalById } = require('../models/signal');

function createServer() {
  // Lazy-require so express stays optional until the API is needed.
  // eslint-disable-next-line global-require
  const express = require('express');
  const app = express();

  app.use(express.json());

  // Serve the (placeholder) static website.
  app.use(express.static(path.join(config.root, 'public')));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // GET /api/signals?status=RUNNING&type=BSJP&limit=50
  app.get('/api/signals', (req, res) => {
    const { status, type, limit } = req.query;
    const signals = listSignals({
      status,
      type,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(signals);
  });

  app.get('/api/signals/:id', (req, res) => {
    const signal = getSignalById(Number(req.params.id));
    if (!signal) return res.status(404).json({ error: 'not found' });
    res.json(signal);
  });

  return app;
}

function start() {
  const app = createServer();
  app.listen(config.api.port, () => {
    console.log(`[api] Listening on http://localhost:${config.api.port}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { createServer, start };
