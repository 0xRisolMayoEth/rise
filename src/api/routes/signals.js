'use strict';

const express = require('express');
const {
  listSignals,
  countSignals,
  getSignalById,
  getSignalUpdates,
} = require('../../models/signal');
const { resolveType } = require('../../utils/signalTypes');
const { formatSignal } = require('../../utils/format');
const { STATUSES } = require('../../models/stats');

const router = express.Router();

/**
 * Validate & normalise the shared list query params.
 * Throws a 400-tagged error on bad input.
 */
function parseListQuery(query) {
  const out = {};

  if (query.status) {
    const status = String(query.status).toUpperCase();
    if (!STATUSES.includes(status)) {
      const err = new Error(`invalid status: ${query.status}`);
      err.status = 400;
      throw err;
    }
    out.status = status;
  }

  if (query.type) {
    const type = resolveType(query.type);
    if (!type) {
      const err = new Error(`invalid type: ${query.type}`);
      err.status = 400;
      throw err;
    }
    out.type = type;
  }

  const limit = Number(query.limit);
  out.limit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

  const offset = Number(query.offset);
  out.offset = Number.isFinite(offset) && offset > 0 ? offset : 0;

  return out;
}

// GET /api/signals?status=RUNNING&type=BSJP&limit=50&offset=0
router.get('/', (req, res) => {
  const opts = parseListQuery(req.query);
  const data = listSignals(opts);
  const total = countSignals({ status: opts.status, type: opts.type });
  res.json({
    data,
    pagination: { total, limit: opts.limit, offset: opts.offset },
  });
});

// GET /api/signals/:id
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const signal = getSignalById(id);
  if (!signal) {
    return res.status(404).json({ error: 'signal not found' });
  }
  // Include the pre-rendered ASCII block for convenience.
  res.json({
    ...signal,
    formatted: formatSignal(signal, new Date(signal.updated_at || signal.created_at)),
  });
});

// GET /api/signals/:id/updates — audit log
router.get('/:id/updates', (req, res) => {
  const id = Number(req.params.id);
  if (!getSignalById(id)) {
    return res.status(404).json({ error: 'signal not found' });
  }
  res.json({ data: getSignalUpdates(id) });
});

module.exports = router;
