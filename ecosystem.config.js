// PM2 process definitions for the RISE Signal System.
//
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   # survive reboots
//
// Three long-running processes share the same SQLite DB and .env:
//   - rise-bot     : Discord bot (analyst input via /signal)
//   - rise-api     : Express API + website (public/)
//   - rise-tracker : IDX price tracker (cron) + multi-platform broadcast
//
// Each process loads .env itself (via src/config), so no env_file is needed.
// Telegram is notification-only and has no process of its own — it is driven
// by the shared broadcaster from the bot and tracker.

const common = {
  cwd: __dirname,
  instances: 1,
  autorestart: true,
  watch: false,
  max_memory_restart: '300M',
  time: true, // timestamp log lines
  env: { NODE_ENV: 'production' },
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'rise-bot',
      script: 'src/discord/bot.js',
      error_file: 'logs/bot.error.log',
      out_file: 'logs/bot.out.log',
    },
    {
      ...common,
      name: 'rise-api',
      script: 'src/api/server.js',
      error_file: 'logs/api.error.log',
      out_file: 'logs/api.out.log',
    },
    {
      ...common,
      name: 'rise-tracker',
      script: 'src/tracker/index.js',
      error_file: 'logs/tracker.error.log',
      out_file: 'logs/tracker.out.log',
    },
  ],
};
