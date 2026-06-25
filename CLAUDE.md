# RISE Signal System — Project Context

> File ini dibuat otomatis dari sesi Claude.ai untuk dilanjutkan di Claude Code.
> Taruh file ini di root folder project kamu.

---

## Ringkasan Proyek

Sistem signal saham terintegrasi dengan:
- **Website** (pusat data & dashboard)
- **Discord Bot** (input signal dari analis + notifikasi ke channel)
- **Telegram Bot** (notifikasi saja)

Analis membuat signal manual via Discord command, sistem menyebarkannya ke semua platform dan tracking performa secara otomatis berdasarkan harga real-time IDX.

---

## Tipe Signal

1. `HAKA PREOPEN`
2. `SNIPER`
3. `BSJP`
4. `SWING`

---

## Format Signal (WAJIB KONSISTEN DI SEMUA PLATFORM)

### NEW SIGNAL (RUNNING)
```
● NEW SIGNAL
┌ SCMA – BSJP
├ Entry  : 214 | 200 | 190
├ AVG    : 200
├ TP     : 222
├ Status : RUNNING
└ 24 Jun 2026 • 15:12 WIB
```

### TP1 HIT
```
● TP1 HIT
┌ SCMA – BSJP
├ Entry  : 214 | 200 | 190
├ AVG    : 200
├ TP     : 222 ✓
├ High   : 223
├ Profit : +3.74%
├ Status : TP1 HIT
└ 24 Jun 2026 • 15:25 WIB
```

### DONE
```
● DONE
┌ SCMA – BSJP
├ Entry  : 214 | 200 | 190
├ AVG    : 200
├ TP     : 222 ✓
├ High   : 230
├ Profit : +7.48%
├ Status : DONE
└ 24 Jun 2026 • 16:03 WIB
```

### Catatan Format
- Gunakan ASCII line (`┌ ├ └`) seperti contoh
- Monospace font di Discord & Telegram (gunakan code block ` ``` `)
- Entry selalu 3 angka; jika tidak ada, isi `-`
- AVG selalu di bawah Entry, TP hanya satu
- Status: `RUNNING`, `TP1 HIT`, `DONE`
- Tampilkan tanggal & waktu format: `24 Jun 2026 • 15:12 WIB`
- Tidak menggunakan emoji, sticker, atau dekorasi tambahan

---

## Input Signal (dari Analis via Discord)

```
/signal <tipe> <ticker> <entry1> <entry2> <entry3> <tp>
```

Contoh:
```
/signal BSJP SCMA 214 200 190 222
```

- `tipe`: HAKA / SNIPER / BSJP / SWING
- `entry1, entry2, entry3`: harga entry (gunakan `-` jika tidak ada)
- `tp`: target profit (harga, bukan %)

---

## Database Schema (SQLite)

```sql
-- Tabel utama signal
CREATE TABLE signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('HAKA PREOPEN','SNIPER','BSJP','SWING')),
  entry1 REAL,
  entry2 REAL,
  entry3 REAL,
  avg REAL,
  tp REAL NOT NULL,
  status TEXT DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','TP1 HIT','DONE')),
  high REAL,
  profit_pct REAL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  closed_at TEXT
);

-- Log perubahan status
CREATE TABLE signal_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER NOT NULL REFERENCES signals(id),
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- User/analis
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'analyst',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- Konfigurasi
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────┐
│                  Analis                          │
│         /signal BSJP SCMA 214 200 190 222        │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │   Discord Bot   │  ← Node.js / discord.js
         │  #signal-feed   │
         └────────┬────────┘
                  │ simpan ke DB
                  ▼
         ┌─────────────────┐
         │  SQLite / DB    │ ← db.sqlite3
         └────────┬────────┘
                  │
         ┌────────┴──────────────────┐
         │                           │
         ▼                           ▼
┌─────────────────┐        ┌──────────────────┐
│  Telegram Bot   │        │  Website / API   │
│  @signal_alerts │        │  Express.js      │
└─────────────────┘        └──────────────────┘
                                     │
                            ┌────────▼────────┐
                            │  Price Tracker  │
                            │  (cron job)     │
                            │  IDX / yfinance │
                            └─────────────────┘
```

---

## Stack Teknologi (Rekomendasi)

| Komponen | Tech |
|----------|------|
| Discord Bot | Node.js + discord.js v14 |
| Telegram Bot | Node.js + node-telegram-bot-api |
| Database | SQLite (better-sqlite3) |
| Backend API | Express.js |
| Price Tracker | node-cron + axios (IDX API) |
| Website Frontend | Vanilla HTML/CSS/JS atau React |
| Hosting | VPS (Ubuntu) — IP: 51.81.87.144 |

---

## Fitur Website (sudah di-prototype di Claude.ai)

Prototype React sudah dibuat dengan fitur:
- **Dashboard**: stat cards, IHSG mini chart, live signals preview, summary per tipe
- **Live Signals**: kartu signal format ASCII, filter per tipe
- **History**: tabel signal DONE/TP1 HIT
- **Statistics**: bar chart profit, donut chart distribusi status, best/worst signal
- **Calendar**: grid kalender dengan indikator hari ada signal

---

## Tracking & Otomasi (Price Tracker)

- Sistem mengambil harga real-time dari sumber data IDX / API
- Status berubah otomatis:
  - `RUNNING` → `TP1 HIT` ketika harga >= TP
  - `RUNNING` → `DONE` jika analis menutup manual / expired / invalid
- Hitung Profit % berdasarkan AVG dan High Price
- Semua perubahan status dikirim otomatis ke Website, Discord, Telegram

---

## Warna Status

- 🟢 **RUNNING** = Hijau
- 🟡 **TP1 HIT** = Kuning/Amber  
- 🔵 **DONE** = Biru

---

## Platform Distribution

| Platform | Fungsi | Format |
|----------|--------|--------|
| Discord `#signal-feed` | Diskusi + notifikasi | Format bagian 3 |
| Telegram `@signal_alerts` | Notifikasi saja | Format bagian 3 |
| Website | Pusat data & dashboard | UI lengkap |

---

## Aturan Tambahan

- Tampilan minimalis, modern, konsisten di semua platform
- Tidak menggunakan emoji, sticker, atau elemen dekoratif berlebihan
- Gunakan dark mode sebagai default di website
- Mobile friendly (prioritas)
- Loading cepat, data real-time
- Semua waktu menggunakan WIB (UTC+7)

---

## Status Project Saat Ini

- [x] Spesifikasi lengkap (dari image prompt)
- [x] Prototype website (dibuat di Claude.ai — React, full interactive)
- [ ] Setup folder structure project
- [ ] Database (SQLite schema)
- [ ] Discord Bot (slash command `/signal`)
- [ ] Telegram Bot (notifikasi)
- [ ] Backend API (Express.js)
- [ ] Price Tracker (cron job)
- [ ] Deploy ke VPS

---

## Mulai dari Sini di Claude Code

Sarankan mulai dari:

```
Buatkan struktur folder project Node.js untuk RISE Signal System 
sesuai arsitektur di CLAUDE.md, lalu buat Discord bot dengan 
slash command /signal yang menyimpan data ke SQLite.
```
