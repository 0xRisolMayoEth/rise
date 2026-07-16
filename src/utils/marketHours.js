'use strict';

/**
 * IDX (Bursa Efek Indonesia) trading-hours helpers.
 *
 * All session math is done in WIB (UTC+7, no DST) regardless of the server
 * timezone, so the tracker behaves identically on any host.
 *
 * Regular JATS sessions:
 *   Mon–Thu : 09:00–12:00, 13:30–15:50
 *   Friday  : 09:00–11:30, 14:00–15:50
 *
 * Exchange holidays are read from src/config/holidays.json; the IDX publishes
 * the calendar (including cuti bersama) yearly — keep that file current.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

// Session windows in minutes-since-midnight WIB, end-exclusive.
const MON_THU = [
  [9 * 60, 12 * 60],
  [13 * 60 + 30, 15 * 60 + 50],
];
const FRIDAY = [
  [9 * 60, 11 * 60 + 30],
  [14 * 60, 15 * 60 + 50],
];

let holidaySet = null;
function holidays() {
  if (holidaySet) return holidaySet;
  try {
    // eslint-disable-next-line global-require
    const { dates } = require('../config/holidays.json');
    holidaySet = new Set(dates || []);
  } catch {
    holidaySet = new Set();
  }
  return holidaySet;
}

/**
 * Decompose an instant into its WIB calendar parts.
 * @param {Date} [date]
 * @returns {{isoDate: string, day: number, minutes: number}}
 *   day: 0=Sunday … 6=Saturday (in WIB); minutes: since midnight WIB.
 */
function wib(date = new Date()) {
  const t = new Date(date.getTime() + WIB_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    isoDate: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`,
    day: t.getUTCDay(),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

/** @param {number} day WIB day-of-week. @returns {Array<[number, number]>} */
function sessionsFor(day) {
  if (day === 5) return FRIDAY;
  if (day >= 1 && day <= 4) return MON_THU;
  return [];
}

/** Weekday and not an exchange holiday (WIB). */
function isTradingDay(date = new Date()) {
  const { isoDate, day } = wib(date);
  return sessionsFor(day).length > 0 && !holidays().has(isoDate);
}

/** Inside a live trading session right now (WIB). */
function isMarketOpen(date = new Date()) {
  const { isoDate, day, minutes } = wib(date);
  if (holidays().has(isoDate)) return false;
  return sessionsFor(day).some(([from, to]) => minutes >= from && minutes < to);
}

module.exports = { isMarketOpen, isTradingDay, wib, sessionsFor };
