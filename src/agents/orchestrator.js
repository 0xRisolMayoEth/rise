'use strict';

/**
 * Orchestrator — koordinator pipeline agent.
 *
 * Tidak ada agent yang bicara langsung ke user; semua lewat sini:
 *
 *   runScan()          07:15  Market Scanner + Technical Analyst + News
 *                             Analyst -> simpan kandidat harian ke DB.
 *   runType('HAKA..')  08:47  Kandidat -> quote live -> Risk Manager ->
 *   runType('BSJP')    15:25  Portfolio Manager -> createSignal ->
 *   runType('SWING')   16:15  broadcast (Discord + Telegram) + laporan admin.
 *   runRecap()         17:00  Performance Analyst + Trading Coach -> admin.
 *
 * Semua fungsi menerima deps opsional (source/notifier di-resolve lazily)
 * sehingga bisa dipanggil manual maupun dari test dengan mock.
 */
const config = require('../config');
const { createLogger } = require('../utils/logger');
const { wib, isTradingDay } = require('../utils/marketHours');
const { sleep } = require('../utils/retry');
const { createSignal } = require('../models/signal');
const { saveCandidates, listCandidates } = require('../models/candidates');
const ops = require('../models/ops');

const marketRegime = require('./marketRegime');
const marketScanner = require('./marketScanner');
const technicalAnalyst = require('./technicalAnalyst');
const riskManager = require('./riskManager');
const newsAnalyst = require('./newsAnalyst');
const portfolioManager = require('./portfolioManager');
const performanceAnalyst = require('./performanceAnalyst');
const tradingCoach = require('./tradingCoach');

const log = createLogger('agents');

/** Default deps: configured price source + multi-platform notifier. */
function resolveDeps(deps = {}) {
  const source = deps.fetchHistory && deps.fetchPrice ? deps : require('../tracker/sources').getSource();
  const notifier = require('../notifier');
  return {
    fetchHistory: deps.fetchHistory || source.fetchHistory,
    fetchPrice: deps.fetchPrice || source.fetchPrice,
    fetchIndexHistory: deps.fetchIndexHistory || source.fetchIndexHistory,
    broadcastSignal: deps.broadcastSignal || notifier.broadcastSignal,
    notifyAdmin: deps.notifyAdmin || notifier.notifyAdmin,
    dryRun: Boolean(deps.dryRun),
  };
}

/** Kirim laporan ke channel admin; kegagalan tidak menghentikan pipeline. */
async function report(notifyAdmin, text) {
  try {
    await notifyAdmin(text);
  } catch (e) {
    log.error('laporan admin gagal terkirim', { error: e.message });
  }
}

/**
 * Scan harian: universe -> filter -> skor -> simpan kandidat.
 * @param {object} [deps]  {fetchHistory, notifyAdmin, dryRun}
 * @returns {Promise<{scanned:number, shortlisted:number, candidates:object[]}>}
 */
async function runScan(deps = {}) {
  const d = resolveDeps(deps);
  const today = wib().isoDate;

  const { scanned, shortlist } = await marketScanner.scan({ fetchHistory: d.fetchHistory });

  const candidates = [];
  for (const { ticker, candles } of shortlist) {
    const analysis = technicalAnalyst.analyse(candles);
    if (!analysis || analysis.score < config.agents.minScore) continue;

    // News Analyst membaca price action mencurigakan saat data masih lengkap.
    const news = newsAnalyst.review({ ticker, candles });
    candidates.push({
      ticker,
      score: analysis.score,
      last: candles[candles.length - 1].close,
      support1: analysis.support1,
      support2: analysis.support2,
      resistance: analysis.resistance,
      metrics: { ...analysis.metrics, trend: analysis.trend, momentum: analysis.momentum, news },
    });
  }
  candidates.sort((a, b) => b.score - a.score);

  if (!d.dryRun) saveCandidates(today, candidates);

  const top = candidates
    .slice(0, 10)
    .map((c) => `  ${c.ticker} score ${c.score} (${c.metrics.trend}/${c.metrics.momentum})`)
    .join('\n');
  await report(
    d.notifyAdmin,
    `AGENT SCAN ${today}${d.dryRun ? ' (dry-run)' : ''}\n` +
      `${scanned} saham discan · ${shortlist.length} lolos filter · ` +
      `${candidates.length} kandidat (score ≥ ${config.agents.minScore})` +
      (top ? `\n${top}` : '')
  );

  log.info(`scan ${today}: ${candidates.length} kandidat tersimpan`);
  return { scanned, shortlisted: shortlist.length, candidates };
}

/**
 * Jalankan pipeline untuk satu tipe sinyal dari kandidat hari ini.
 * @param {string} type   'HAKA PREOPEN' | 'BSJP' | 'SWING'
 * @param {object} [deps] {fetchPrice, broadcastSignal, notifyAdmin, dryRun}
 * @returns {Promise<{created:object[], skipped:Array<{ticker:string, reason:string}>}>}
 */
async function runType(type, deps = {}) {
  if (!config.agents.types[type]) throw new Error(`tipe tidak dikenal: ${type}`);
  const d = resolveDeps(deps);
  const today = wib().isoDate;

  // Gerbang kondisi pasar: jangan buat sinyal momentum saat IHSG bearish.
  if (config.agents.regime.enabled) {
    const regime = await marketRegime.check(d);
    if (!regime.bullish) {
      log.info(`run ${type} dibatalkan — ${regime.reason}`);
      await report(
        d.notifyAdmin,
        `AGENT RUN ${type} ${today} DIBATALKAN\nMarket regime bearish: ${regime.reason}`
      );
      return { created: [], skipped: [], regime };
    }
  }

  const candidates = listCandidates(today);
  const skipped = [];
  const plans = [];

  for (let i = 0; i < candidates.length; i += 1) {
    if (i > 0 && config.agents.fetchDelayMs > 0) await sleep(config.agents.fetchDelayMs);
    const c = candidates[i];

    // Veto News Analyst dari fase scan.
    if (c.metrics && c.metrics.news && c.metrics.news.veto) {
      skipped.push({ ticker: c.ticker, reason: c.metrics.news.notes.join('; ') });
      continue;
    }

    let quote;
    try {
      quote = await d.fetchPrice(c.ticker);
    } catch (e) {
      skipped.push({ ticker: c.ticker, reason: `quote gagal: ${e.message}` });
      continue;
    }

    // Sanity check live vs harga scan: sudah lari terlalu jauh -> lewati.
    if (c.last > 0 && (quote.last - c.last) / c.last > 0.1) {
      skipped.push({ ticker: c.ticker, reason: 'harga sudah naik >10% dari harga scan' });
      continue;
    }

    // BSJP butuh momentum intraday: harga sore tidak di bawah close kemarin.
    if (type === 'BSJP' && quote.last < c.last) {
      skipped.push({ ticker: c.ticker, reason: 'momentum intraday negatif' });
      continue;
    }

    const plan = riskManager.buildPlan({
      type,
      last: quote.last,
      support1: c.support1,
      support2: c.support2,
    });
    if (!plan) {
      skipped.push({ ticker: c.ticker, reason: 'trade plan tidak valid' });
      continue;
    }
    plans.push({ ticker: c.ticker, score: c.score, plan });
  }

  // Portfolio Manager: gerbang alokasi & konsentrasi risiko.
  const { accepted, rejected, openCount, cashPct } = portfolioManager.select(plans);
  for (const r of rejected) skipped.push({ ticker: r.candidate.ticker, reason: r.reason });

  const created = [];
  for (const { ticker, score, plan } of accepted) {
    if (d.dryRun) {
      log.info(
        `[dry-run] ${type} ${ticker}: entry ${plan.entry1}|${plan.entry2 ?? '-'}|${plan.entry3 ?? '-'} ` +
          `TP ${plan.tp} SL ${plan.sl} (${plan.lots} lot)`
      );
      created.push({ ticker, type, ...plan, score });
      continue;
    }
    const signal = createSignal({
      ticker,
      type,
      entry1: plan.entry1,
      entry2: plan.entry2,
      entry3: plan.entry3,
      tp: plan.tp,
      sl: plan.sl,
      source: 'agent',
      score,
    });
    created.push(signal);
    await d.broadcastSignal(signal);
    log.info(`sinyal agent dibuat: ${ticker} ${type} (score ${score})`);
  }

  const lines = created.map((s) => {
    const p = plans.find((x) => x.ticker === s.ticker);
    const lot = p ? ` · ${p.plan.lots} lot · R/R ${p.plan.riskReward ?? '-'}` : '';
    return `  ${s.ticker} score ${s.score ?? '-'} · entry ${s.entry1} · TP ${s.tp} · SL ${s.sl}${lot}`;
  });
  await report(
    d.notifyAdmin,
    `AGENT RUN ${type} ${today}${d.dryRun ? ' (dry-run)' : ''}\n` +
      `${candidates.length} kandidat · ${created.length} sinyal dibuat · ` +
      `${skipped.length} dilewati · posisi terbuka ${openCount}/${config.agents.maxOpenPositions} · ` +
      `sisa alokasi ${cashPct}%` +
      (lines.length ? `\n${lines.join('\n')}` : '') +
      (skipped.length
        ? `\nDilewati:\n${skipped.slice(0, 10).map((s) => `  ${s.ticker}: ${s.reason}`).join('\n')}`
        : '')
  );

  return { created, skipped };
}

/**
 * Recap harian: Performance Analyst + saran Trading Coach ke channel admin.
 * @param {object} [deps] {notifyAdmin}
 */
async function runRecap(deps = {}) {
  const d = resolveDeps(deps);
  const { text, performance } = performanceAnalyst.recap();
  const advice = tradingCoach.advise(performance);
  const full = advice.length ? `${text}\n\nSARAN COACH:\n${advice.map((a) => `  - ${a}`).join('\n')}` : text;
  await report(d.notifyAdmin, full);
  return { text: full, advice };
}

/**
 * Guard bersama untuk semua cron: hanya hari bursa, dan heartbeat tercatat.
 * @param {string} label
 * @param {() => Promise<any>} fn
 */
async function guarded(label, fn) {
  if (!isTradingDay()) {
    log.info(`${label} dilewati — bukan hari bursa`);
    return null;
  }
  try {
    const result = await fn();
    ops.beatOk('agents');
    return result;
  } catch (e) {
    log.error(`${label} gagal`, { error: e.message });
    ops.beatError('agents', e.message);
    return null;
  }
}

module.exports = { runScan, runType, runRecap, guarded };
