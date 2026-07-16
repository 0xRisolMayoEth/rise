'use strict';

/**
 * Backtest walk-forward pipeline agent terhadap data historis.
 *
 * Memakai modul yang sama persis dengan pipeline live (scanner filter,
 * technical analyst, news analyst, regime filter), lalu mensimulasikan
 * hasil TP/SL/time-stop per tipe sinyal:
 *
 *   node scripts/backtest.js [--range 6mo] [--limit 50] [--min-score 85]
 *                            [--no-regime] [--delay 300]
 *
 * PRICE_SOURCE menentukan sumber data (idx = Yahoo nyata, mock = sintetis).
 * Konvensi konservatif: bila TP dan SL tersentuh di hari yang sama,
 * dihitung LOSS (kita tidak tahu mana yang kena duluan pada data harian).
 */
const config = require('../src/config');
const { getSource } = require('../src/tracker/sources');
const { passesFilters, loadUniverse } = require('../src/agents/marketScanner');
const { analyse } = require('../src/agents/technicalAnalyst');
const { review } = require('../src/agents/newsAnalyst');
const { assess } = require('../src/agents/marketRegime');
const { sleep } = require('../src/utils/retry');

const MIN_HISTORY = 40; // candle sebelum hari pertama yang boleh bersinyal

function parseArgs(argv) {
  const args = { range: '6mo', limit: Infinity, minScore: config.agents.minScore, regime: true, delay: config.agents.fetchDelayMs };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--range') args.range = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--min-score') args.minScore = Number(argv[++i]);
    else if (a === '--no-regime') args.regime = false;
    else if (a === '--delay') args.delay = Number(argv[++i]);
    else throw new Error(`argumen tidak dikenal: ${a}`);
  }
  return args;
}

/**
 * Simulasikan satu sinyal dari hari `d` (entry = close hari itu).
 * @returns {{outcome:'TP'|'SL'|'TIME', profitPct:number, exitDay:number}}
 */
function simulate(candles, d, pct, maxAgeDays) {
  const entry = candles[d].close;
  const tp = entry * (1 + pct.tp / 100);
  const sl = entry * (1 - pct.sl / 100);
  const lastDay = Math.min(candles.length - 1, maxAgeDays > 0 ? d + maxAgeDays : candles.length - 1);

  for (let i = d + 1; i <= lastDay; i += 1) {
    const c = candles[i];
    const hitTp = c.high >= tp;
    const hitSl = c.low <= sl;
    if (hitSl && hitTp) return { outcome: 'SL', profitPct: -pct.sl, exitDay: i }; // konservatif
    if (hitTp) return { outcome: 'TP', profitPct: pct.tp, exitDay: i };
    if (hitSl) return { outcome: 'SL', profitPct: -pct.sl, exitDay: i };
  }
  const exit = candles[lastDay].close;
  return {
    outcome: 'TIME',
    profitPct: Math.round(((exit - entry) / entry) * 10000) / 100,
    exitDay: lastDay,
  };
}

/** Rangkum satu daftar trade menjadi metrik. */
function summarise(trades) {
  const n = trades.length;
  if (!n) return { signals: 0 };
  const wins = trades.filter((t) => t.profitPct >= 0).length;
  const grossP = trades.filter((t) => t.profitPct > 0).reduce((a, t) => a + t.profitPct, 0);
  const grossL = Math.abs(trades.filter((t) => t.profitPct < 0).reduce((a, t) => a + t.profitPct, 0));
  const round2 = (x) => Math.round(x * 100) / 100;
  return {
    signals: n,
    tp: trades.filter((t) => t.outcome === 'TP').length,
    sl: trades.filter((t) => t.outcome === 'SL').length,
    time: trades.filter((t) => t.outcome === 'TIME').length,
    winRate: round2((wins / n) * 100),
    profitFactor: grossL > 0 ? round2(grossP / grossL) : grossP > 0 ? Infinity : 0,
    expectancy: round2(trades.reduce((a, t) => a + t.profitPct, 0) / n),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const source = getSource();
  if (!source.fetchHistory) throw new Error(`source '${config.tracker.source}' tidak punya fetchHistory`);

  const universe = loadUniverse().slice(0, args.limit);
  console.log(
    `[backtest] ${universe.length} ticker · range ${args.range} · minScore ${args.minScore} · ` +
      `regime ${args.regime ? 'on' : 'off'} · source ${config.tracker.source} · ` +
      `konservatif (TP+SL sehari = LOSS)`
  );

  // Data index untuk regime filter, di-assess per tanggal trade.
  let indexCandles = [];
  if (args.regime) {
    if (source.fetchIndexHistory) {
      try {
        indexCandles = await source.fetchIndexHistory(args.range);
      } catch (e) {
        console.warn(`[backtest] index gagal (${e.message}) — regime dilewati`);
      }
    } else {
      console.warn('[backtest] source tanpa fetchIndexHistory — regime dilewati');
    }
  }
  const indexUpTo = (time) => indexCandles.filter((c) => c.time <= time);

  const byType = Object.fromEntries(Object.keys(config.agents.types).map((t) => [t, []]));
  let scannedDays = 0;
  let regimeBlocked = 0;

  for (let u = 0; u < universe.length; u += 1) {
    if (u > 0 && args.delay > 0) await sleep(args.delay);
    const ticker = universe[u];
    let candles;
    try {
      candles = await source.fetchHistory(ticker, args.range);
    } catch (e) {
      console.warn(`[backtest] ${ticker} dilewati: ${e.message}`);
      continue;
    }
    if (candles.length < MIN_HISTORY + 2) continue;

    let openUntil = -1; // satu posisi per ticker, meniru Portfolio Manager
    for (let d = MIN_HISTORY; d < candles.length - 1; d += 1) {
      if (d <= openUntil) continue;
      scannedDays += 1;

      const window = candles.slice(0, d + 1);
      if (!passesFilters(window).pass) continue;
      const a = analyse(window);
      if (!a || a.score < args.minScore) continue;
      if (review({ ticker, candles: window }).veto) continue;
      if (args.regime && indexCandles.length) {
        if (!assess(indexUpTo(candles[d].time)).bullish) {
          regimeBlocked += 1;
          continue;
        }
      }

      let exitDay = d;
      for (const [type, pct] of Object.entries(config.agents.types)) {
        const r = simulate(candles, d, pct, pct.maxAgeDays ?? config.agents.maxAgeDays);
        byType[type].push({ ticker, day: d, score: a.score, ...r });
        exitDay = Math.max(exitDay, r.exitDay);
      }
      openUntil = exitDay;
    }
  }

  console.log(`\n[backtest] ${scannedDays} hari-ticker dievaluasi · ${regimeBlocked} diblokir regime\n`);
  console.log('Tipe           Sinyal  TP   SL   Time  WinRate   PF     Expectancy/sinyal');
  console.log('─'.repeat(78));
  for (const [type, trades] of Object.entries(byType)) {
    const s = summarise(trades);
    if (!s.signals) {
      console.log(`${type.padEnd(14)} 0       —    —    —     —         —      —`);
      continue;
    }
    console.log(
      `${type.padEnd(14)} ${String(s.signals).padEnd(7)} ${String(s.tp).padEnd(4)} ` +
        `${String(s.sl).padEnd(4)} ${String(s.time).padEnd(5)} ${String(s.winRate + '%').padEnd(9)} ` +
        `${String(s.profitFactor).padEnd(6)} ${s.expectancy >= 0 ? '+' : ''}${s.expectancy}%`
    );
  }
  console.log(
    '\nCatatan: entry = close hari sinyal; belum termasuk slippage/fee; ' +
      'TP+SL di hari yang sama dihitung loss (konservatif).'
  );
}

main().catch((e) => {
  console.error('[backtest] gagal:', e.message);
  process.exit(1);
});
