'use strict';

/**
 * Agent 2 — Technical Analyst.
 *
 * Scores a candidate 0-100 from its daily candles. The bar is deliberately
 * strict — only A+ setups should clear the default minScore (85):
 *
 *   Trend      (EMA9 vs EMA21 vs harga)                 0-25
 *   Momentum   (RSI-14 sweet spot 55-65)                0-15
 *   MACD       (histogram positif & menguat)            0-20
 *   Volume     (spike ≥2× rata-rata 20 hari = penuh)    0-20
 *   Price act. (di atas high kemarin & candle bullish)  0-10
 *   Breakout   (close menembus resistance 20 hari)      0-10
 *
 * Also derives support/resistance levels used by the Risk Manager for the
 * entry ladder.
 */
const { ema, rsi, macd } = require('./indicators');

/**
 * Swing levels from recent candles:
 *   resistance — highest high of the last 20 days (excluding today);
 *   support1   — lowest low of the last 10 days;
 *   support2   — lowest low of the last 20 days.
 * @param {Array<{high:number, low:number}>} candles  Oldest first.
 */
function levels(candles) {
  const prior = candles.slice(0, -1);
  const last20 = prior.slice(-20);
  const last10 = prior.slice(-10);
  if (!last20.length) return { support1: null, support2: null, resistance: null };
  return {
    resistance: Math.max(...last20.map((c) => c.high)),
    support1: last10.length ? Math.min(...last10.map((c) => c.low)) : null,
    support2: Math.min(...last20.map((c) => c.low)),
  };
}

/**
 * Analyse one candidate.
 *
 * @param {Array<{open:number, high:number, low:number, close:number, volume:number}>} candles
 * @returns {{score:number, trend:string, momentum:string, metrics:object,
 *            support1:number|null, support2:number|null, resistance:number|null}|null}
 *   null when there is not enough history to judge.
 */
function analyse(candles) {
  if (!Array.isArray(candles) || candles.length < 35) return null;

  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const rsi14 = rsi(closes, 14);
  const m = macd(closes);
  const { support1, support2, resistance } = levels(candles);

  let score = 0;

  // Trend (0-25): price above both EMAs, EMAs stacked bullishly.
  const uptrend = last.close > ema9 && ema9 > ema21;
  if (uptrend) score += 25;
  else if (last.close > ema21) score += 12;

  // Momentum (0-15): tight RSI sweet spot — trending but not euphoric.
  if (rsi14 !== null) {
    if (rsi14 >= 55 && rsi14 <= 65) score += 15;
    else if ((rsi14 >= 50 && rsi14 < 55) || (rsi14 > 65 && rsi14 <= 70)) score += 7;
  }

  // MACD (0-20): histogram positive, extra when strengthening.
  if (m) {
    if (m.histogram > 0 && m.histogram >= m.prevHistogram) score += 20;
    else if (m.histogram > 0) score += 12;
    else if (m.histogram > m.prevHistogram) score += 5;
  }

  // Volume (0-20): full points demand a real spike (≥2× the 20-day average).
  const vol20 = candles.slice(-20).reduce((a, c) => a + c.volume, 0) / Math.min(20, candles.length);
  const volRatio = vol20 > 0 ? last.volume / vol20 : 0;
  if (volRatio >= 2) score += 20;
  else if (volRatio >= 1.5) score += 10;

  // Price action (0-10): above yesterday's high + bullish close.
  if (last.close > prev.high) score += 5;
  if (last.close > last.open) score += 5;

  // Breakout (0-10): close through the 20-day resistance, not just
  // yesterday's high — the setup the whole pipeline is hunting for.
  if (resistance !== null && last.close >= resistance) score += 10;

  return {
    score: Math.min(100, Math.round(score)),
    trend: uptrend ? 'Bullish' : last.close > ema21 ? 'Netral' : 'Bearish',
    momentum: rsi14 !== null && rsi14 >= 50 ? 'Kuat' : 'Lemah',
    support1,
    support2,
    resistance,
    metrics: {
      close: last.close,
      ema9: ema9 !== null ? Math.round(ema9 * 100) / 100 : null,
      ema21: ema21 !== null ? Math.round(ema21 * 100) / 100 : null,
      rsi14: rsi14 !== null ? Math.round(rsi14 * 100) / 100 : null,
      macdHistogram: m ? Math.round(m.histogram * 10000) / 10000 : null,
      volumeRatio: Math.round(volRatio * 100) / 100,
    },
  };
}

module.exports = { analyse, levels };
