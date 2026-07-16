// PM2 process definitions for the RISE Signal System.
//
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   # survive reboots
//
// Four long-running processes share the same SQLite DB and .env:
//   - rise-bot     : Discord bot (analyst input via /signal)
//   - rise-api     : Express API + website (public/)
//   - rise-tracker : IDX price tracker (cron) + multi-platform broadcast
//   - rise-agents  : automated signal pipeline (needs ENABLE_AGENTS=1 in .env)
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
    {
      ...common,
      name: 'rise-agents',
      script: 'src/agents/index.js',
      error_file: 'logs/agents.error.log',
      out_file: 'logs/agents.out.log',
      // The process exits by design when ENABLE_AGENTS!=1 — don't restart-loop.
      autorestart: true,
      max_restarts: 3,
    },
  ],
};
