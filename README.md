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
├── package.json
├── .env.example              # Copy to .env and fill in
├── public/                   # Website (placeholder)
│   └── index.html
├── data/                     # SQLite file lives here (gitignored)
└── src/
    ├── index.js              # Main entrypoint (npm start)
    ├── config/               # Env-based configuration
    │   └── index.js
    ├── database/
    │   ├── schema.sql        # Tables: signals, signal_updates, users, settings
    │   ├── db.js             # Shared better-sqlite3 connection
    │   └── migrate.js        # npm run migrate
    ├── models/
    │   └── signal.js         # create / list / update signals
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
    │   └── bot.js            # Notification broadcaster (scaffold)
    ├── api/
    │   └── server.js         # Express read API (scaffold)
    └── tracker/
        └── tracker.js        # IDX price tracker / cron (scaffold)
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

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Boot the system (Discord bot; API if `ENABLE_API=1`) |
| `npm run bot` | Start only the Discord bot |
| `npm run deploy-commands` | Register slash commands with Discord |
| `npm run migrate` | Apply the SQLite schema |
| `npm run api` | Start the Express read API |
