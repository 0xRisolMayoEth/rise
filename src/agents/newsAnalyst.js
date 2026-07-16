'use strict';

/**
 * Agent 4 — News Analyst (v1, rule-based).
 *
 * Tanpa sumber berita eksternal, versi awal ini membaca "berita" dari price
 * action yang mencurigakan dan bisa mem-veto kandidat:
 *   - sudah naik terlalu tinggi dalam 2 hari (rawan ARB / pump);
 *   - gap-up ekstrem hari ini vs close kemarin.
 *
 * Interface-nya stabil ({sentiment, notes, veto}) sehingga nanti tinggal
 * di-upgrade ke sumber berita/keterbukaan informasi sungguhan tanpa mengubah
 * orchestrator.
 */

/**
 * @param {object} input
 * @param {string} input.ticker
 * @param {Array<{open:number, close:number}>} [input.candles]  Oldest first.
 * @returns {{sentiment:'POSITIF'|'NETRAL'|'NEGATIF', notes:string[], veto:boolean}}
 */
function review(input) {
  const notes = [];
  let veto = false;

  const candles = input.candles || [];
  const n = candles.length;
  if (n >= 3) {
    const last = candles[n - 1];
    const prev = candles[n - 2];
    const before = candles[n - 3];

    const rise2d = before.close > 0 ? (last.close - before.close) / before.close : 0;
    if (rise2d > 0.2) {
      notes.push(`sudah naik ${Math.round(rise2d * 100)}% dalam 2 hari — rawan koreksi/ARB`);
      veto = true;
    }

    const gap = prev.close > 0 ? (last.open - prev.close) / prev.close : 0;
    if (gap > 0.1) {
      notes.push(`gap-up ${Math.round(gap * 100)}% dari close kemarin — entry berisiko`);
      veto = true;
    }
  }

  return { sentiment: veto ? 'NEGATIF' : 'NETRAL', notes, veto };
}

module.exports = { review };
