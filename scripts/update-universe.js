'use strict';

/**
 * Perbarui daftar universe scanner (src/config/idx-tickers.json) dengan
 * seluruh saham tercatat di BEI, diambil dari endpoint publik idx.co.id.
 *
 *   node scripts/update-universe.js
 *
 * Catatan: idx.co.id memakai WAF yang kadang memblokir request non-browser.
 * Kalau gagal, file JSON bisa diedit manual — formatnya cuma
 * { "tickers": ["BBCA", ...] }.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OUT = path.join(__dirname, '..', 'src', 'config', 'idx-tickers.json');
const URL =
  'https://www.idx.co.id/primary/StockData/GetSecuritiesStock?start=0&length=2000&code=&sector=';

async function main() {
  console.log('[universe] mengambil daftar saham dari idx.co.id ...');
  const res = await axios.get(URL, {
    timeout: 30000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://www.idx.co.id/id/data-pasar/data-saham/daftar-saham/',
    },
  });

  const rows = res.data && (res.data.data || res.data.Data || res.data.result);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('bentuk respons tidak dikenal — cek endpoint atau update manual');
  }

  const tickers = [...new Set(rows.map((r) => String(r.Code || r.code || '').trim().toUpperCase()))]
    .filter((t) => /^[A-Z]{4}$/.test(t))
    .sort();

  const current = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  fs.writeFileSync(OUT, `${JSON.stringify({ ...current, tickers }, null, 2)}\n`);
  console.log(`[universe] tersimpan: ${tickers.length} ticker -> ${OUT}`);
}

main().catch((e) => {
  console.error('[universe] gagal:', e.message);
  console.error('[universe] daftar lama tetap dipakai; edit manual bila perlu.');
  process.exit(1);
});
