'use strict';

const express = require('express');
const { getStats, getCalendar } = require('../../models/stats');

const router = express.Router();

// GET /api/stats — dashboard + statistics aggregates
router.get('/stats', (_req, res) => {
  res.json(getStats());
});

// GET /api/calendar?month=YYYY-MM  (defaults to the current month)
router.get('/calendar', (req, res) => {
  let year;
  let month;

  if (req.query.month) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.month));
    if (!m) {
      const err = new Error('month must be in YYYY-MM format');
      err.status = 400;
      throw err;
    }
    year = Number(m[1]);
    month = Number(m[2]);
    if (month < 1 || month > 12) {
      const err = new Error('month must be between 01 and 12');
      err.status = 400;
      throw err;
    }
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  res.json(getCalendar(year, month));
});

module.exports = router;
