# RISE Signal System

Stock signal platform integrating **Discord** (analyst input + notifications),
**Telegram** (notifications), and a **website/API**, with real-time IDX price
tracking. See [`CLAUDE.md`](./CLAUDE.md) for the full specification.

This repository currently implements the **folder structure**, the **SQLite
database**, and the **Discord `/signal` slash command** that persists signals
to the database. Telegram, the backend API, and the price tracker are
scaffolded and ready to extend.

## Folder structure

```
rise/
├── CLAUDE.md                 # Project spec / context
├── DEPLOY.md                 # VPS deployment guide
├── ecosystem.config.js       # PM2 process definitions (bot/api/tracker)
├── deploy/                   # nginx + systemd unit examples
├── package.json
├── .env.example              # Copy to .env and fill in
├── public/                   # Website dashboard (single-file, served by the API)
│   └── index.html            # self-contained: inline CSS + JS
├── data/                     # SQLite file lives here (gitignored)
└── src/
    ├── index.js              # Main entrypoint (npm start)
    ├── config/               # Env-based configuration
    │   └── index.js
    ├── database/
    │   ├── schema.sql        # Tables: signals, signal_updates, users, settings
    │   ├── db.js             # Shared better-sqlite3 connection
    │   └── migrate.js        # npm run migrate
    ├── notifier.js           # Shared multi-platform broadcaster
    ├── models/
    │   ├── signal.js         # create / list / update signals
    │   └── stats.js          # dashboard / calendar aggregates
    ├── utils/
    │   ├── format.js         # ASCII signal formatter (WIB time)
    │   └── signalTypes.js    # Type mapping + slash-command choices
    ├── discord/
    │   ├── bot.js            # discord.js v14 client (npm run bot)
    │   ├── deploy-commands.js# Register slash commands
    │   └── commands/
    │       ├── index.js      # Command loader
    │       └── signal.js     # /signal command
    ├── telegram/
    │   ├── bot.js            # Send-only client + broadcast/verify
    │   └── index.js          # Connectivity check / test send (npm run telegram)
    ├── api/
    │   ├── server.js         # Express read API (npm run api)
    │   └── routes/           # signals + stats/calendar routes
    └── tracker/
        ├── index.js          # Tracker entrypoint (npm run tracker)
        ├── tracker.js        # Engine: transitions + high/profit tracking
        └── sources/
            ├── index.js      # Source selector (mock | idx)
            ├── mock.js       # Offline random-walk source (dev)
            └── idx.js        # Live IDX quotes via axios
```

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    then set DISCORD_TOKEN, DISCORD_CLIENT_ID, (and DISCORD_GUILD_ID for dev)

# 3. Initialise the database (optional — auto-runs on first boot)
npm run migrate

# 4. Register the slash command with Discord
npm run deploy-commands

# 5. Start the bot
npm run bot
# or start everything wired so far:
npm start
```

## The `/signal` command

```
/signal tipe:<HAKA|SNIPER|BSJP|SWING> ticker:<SCMA> entry1:<214> entry2:<200> entry3:<190> tp:<222>
```

- `tipe` — `HAKA` is stored as `HAKA PREOPEN` (per the schema CHECK constraint).
- `entry1` / `entry2` / `entry3` — prices; pass `-` (or leave blank) when absent.
- `tp` — target profit **price** (required).

The command computes the entry **AVG**, inserts a `RUNNING` signal into SQLite
(plus an audit row in `signal_updates`), and replies with the canonical block:

```
● NEW SIGNAL
┌ SCMA – BSJP
├ Entry  : 214 | 200 | 190
├ AVG    : 201.33
├ TP     : 222
├ Status : RUNNING
└ 24 Jun 2026 • 15:12 WIB
```

## Website (dashboard)

A dark-mode, mobile-first dashboard lives in `public/index.html` as a single
self-contained file (inline CSS + JS, no build step) and is served by the API
itself. Open `http://localhost:3000/` after `npm run api`. It provides:

- **Header** with the RISE logo, a live API-health dot, the last-updated time
  (WIB), and a manual refresh button.
- **Summary stats** — Total Signal, Win Rate, and Avg Profit (computed
  client-side from the signal list).
- **Signal table** — Ticker, Tipe, Entry, TP, Status, Tanggal — with
  colour-coded status badges (RUNNING green / TP1 HIT amber / DONE blue).
- **Status filter** — chips for Semua / RUNNING / TP1 HIT / DONE, each with a
  live count.
- **Auto-refresh** every 30s from `GET /api/signals` (paused while the tab is
  hidden, and triggered immediately when it regains focus).

## Backend API

A read-only Express API serves the same SQLite database the bot writes to.
Start it with `npm run api` (port from `API_PORT`, default `3000`), or run it
alongside the bot via `ENABLE_API=1 npm start`. It also serves the static
website from `public/`.

| Method & path | Description |
|---------------|-------------|
| `GET /api/health` | Liveness check |
| `GET /api/signals?status=&type=&limit=&offset=` | List signals (filtered, paginated). Returns `{ data, pagination }` |
| `GET /api/signals/:id` | One signal, plus a pre-rendered `formatted` ASCII block |
| `GET /api/signals/:id/updates` | Status audit log for a signal |
| `GET /api/stats` | Dashboard aggregates: totals, counts by status/type, win rate, avg profit, best/worst |
| `GET /api/calendar?month=YYYY-MM` | Per-day signal counts for a month (defaults to current month) |

`status` accepts `RUNNING` / `TP1 HIT` / `DONE`; `type` accepts the short
forms (`HAKA`/`SNIPER`/`BSJP`/`SWING`). Invalid filters return `400`, unknown
resources `404`.

Example:

```bash
curl "http://localhost:3000/api/signals?status=RUNNING&type=BSJP"
curl "http://localhost:3000/api/stats"
```

## Price Tracker

A cron job (`npm run tracker`) pulls real-time prices for every `RUNNING`
signal and, per CLAUDE.md, auto-advances status and tracks performance:

- keeps the **High** water mark and **Profit %** current (profit is computed
  from the entry **AVG** and the High price);
- `RUNNING → TP1 HIT` once the price reaches **TP**;
- `RUNNING → DONE` when a signal exceeds `TRACKER_MAX_AGE_DAYS` (expired);
- broadcasts every status change to **Discord** (`#signal-feed`, via REST) and
  **Telegram**.

Price sources are pluggable (`PRICE_SOURCE`):

| Source | Use |
|--------|-----|
| `mock` (default) | Offline random-walk quotes — runs with no network/API |
| `idx` | Live quotes via axios from `IDX_API_URL` (defaults to Yahoo Finance, IDX `.JK` symbols). Adapt `src/tracker/sources/idx.js#parseQuote` for other providers |

```bash
PRICE_SOURCE=mock npm run tracker            # demo without any external API
PRICE_SOURCE=idx  TRACKER_CRON="*/2 * * * *" npm run tracker
```

## Telegram (notifications)

Telegram is **notification-only** — it never accepts input, it just mirrors the
formatted signal blocks to the channel (e.g. `@signal_alerts`). Notifications
are pushed by the shared broadcaster (`src/notifier.js`), so there is no
long-running Telegram process; you only need a bot token and the target chat.

```bash
# Set TELEGRAM_TOKEN and TELEGRAM_CHAT_ID in .env, then:
npm run telegram                 # verify the token and print the bot identity
npm run telegram -- "test ping"  # send a test message to the channel
```

### All-platform broadcast

A single signal reaches every platform through `src/notifier.js`:

- **NEW SIGNAL** — when `/signal` runs, Discord gets the command reply; Telegram
  is notified too (and the dedicated `#signal-feed` channel as well, if
  `DISCORD_SIGNAL_CHANNEL_ID` points somewhere other than where the command ran).
- **TP1 HIT / DONE** — the price tracker pushes status changes to the Discord
  feed channel (via REST) and Telegram.

Each channel is best-effort and fails independently, so a misconfigured or
down platform never blocks the others.

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Boot the system (Discord bot; API if `ENABLE_API=1`; tracker if `ENABLE_TRACKER=1`) |
| `npm run bot` | Start only the Discord bot |
| `npm run deploy-commands` | Register slash commands with Discord |
| `npm run migrate` | Apply the SQLite schema |
| `npm run api` | Start the Express read API |
| `npm run tracker` | Start the price tracker cron loop |
| `npm run telegram` | Verify Telegram config / send a test message |

## Deployment

Production deploy to a VPS (Ubuntu) runs three processes — `rise-bot`,
`rise-api`, `rise-tracker` — under **PM2** (`ecosystem.config.js`), sharing one
SQLite DB and `.env`. The API process also serves the website. See
[`DEPLOY.md`](./DEPLOY.md) for the full walkthrough (Node setup, `npm ci`,
`.env`, `deploy-commands`, PM2, optional nginx + HTTPS). A systemd alternative
lives in `deploy/systemd/`.

```bash
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```
