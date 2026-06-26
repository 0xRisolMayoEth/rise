# Deploy — RISE Signal System (VPS Ubuntu)

Panduan deploy ke VPS Ubuntu (contoh IP `51.81.87.144`). Tiga proses berbagi
satu database SQLite dan satu `.env`:

| Proses | Script | Fungsi |
|--------|--------|--------|
| `rise-bot` | `src/discord/bot.js` | Discord bot — input `/signal` |
| `rise-api` | `src/api/server.js` | API + website (`public/`) di port 3000 |
| `rise-tracker` | `src/tracker/index.js` | Price tracker (cron) + broadcast |

Telegram bersifat notifikasi saja dan tidak punya proses sendiri — dipicu oleh
bot & tracker lewat broadcaster bersama.

---

## 1. Prasyarat di VPS

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Build tools untuk better-sqlite3 (kompilasi native) + git
sudo apt-get install -y build-essential python3 git

# PM2 (process manager)
sudo npm install -g pm2

node -v && npm -v && pm2 -v
```

## 2. Ambil kode

```bash
sudo mkdir -p /opt/rise && sudo chown "$USER" /opt/rise
git clone <REPO_URL> /opt/rise
cd /opt/rise
git checkout claude/wizardly-babbage-xsprdi
```

## 3. Install dependency

```bash
# Termasuk optionalDependencies (express, node-cron, axios, telegram)
npm ci
```

## 4. Konfigurasi `.env`

```bash
cp .env.example .env
nano .env
```

Isi minimal:

```
DISCORD_TOKEN=...                 # token bot
DISCORD_CLIENT_ID=...             # application id
DISCORD_GUILD_ID=...              # server id (deploy command instan)
DISCORD_SIGNAL_CHANNEL_ID=...     # channel #signal-feed (broadcast tracker)

TELEGRAM_TOKEN=...                # opsional (notifikasi)
TELEGRAM_CHAT_ID=...

DATABASE_PATH=data/db.sqlite3
API_PORT=3000

PRICE_SOURCE=idx                  # quote live IDX (default mock)
TRACKER_CRON=* * * * *
TZ=Asia/Jakarta
```

> `.env` sudah masuk `.gitignore` — jangan commit. Jangan pakai `.env.save`.

## 5. Inisialisasi & registrasi command

```bash
npm run migrate            # buat skema SQLite (opsional, auto saat boot)
npm run deploy-commands    # daftarkan slash command /signal ke Discord
```

Ulangi `npm run deploy-commands` hanya bila definisi command berubah.

## 6. Jalankan dengan PM2

```bash
pm2 start ecosystem.config.js
pm2 save                   # simpan daftar proses
pm2 startup                # ikuti instruksi yang dicetak agar auto-start saat reboot

pm2 status
pm2 logs rise-bot          # atau rise-api / rise-tracker
```

Cek kesehatan API & website:

```bash
curl -s localhost:3000/api/health     # {"ok":true,...}
# website: http://<IP>:3000/  (atau via nginx, langkah 7)
```

## 7. (Opsional) Nginx + HTTPS

Agar website/API tampil di port 80/443 dengan domain:

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx-rise.conf /etc/nginx/sites-available/rise
sudo ln -s /etc/nginx/sites-available/rise /etc/nginx/sites-enabled/rise
# edit server_name di file tsb ke domain kamu
sudo nginx -t && sudo systemctl reload nginx

# HTTPS gratis
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # 80 + 443
sudo ufw enable
```

Biarkan `API_PORT=3000` terikat ke localhost; nginx yang menghadap publik.

## 8. Update versi baru

```bash
cd /opt/rise
git pull
npm ci
npm run deploy-commands       # hanya jika command berubah
pm2 reload ecosystem.config.js
```

---

## Alternatif: systemd (tanpa PM2)

Unit file ada di `deploy/systemd/`. Sesuaikan `User=` dan `WorkingDirectory=`
(contoh `/opt/rise`), lalu:

```bash
sudo useradd -r -s /usr/sbin/nologin rise   # user khusus (opsional)
sudo chown -R rise /opt/rise

sudo cp deploy/systemd/rise-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rise-bot rise-api rise-tracker

systemctl status rise-bot
journalctl -u rise-tracker -f
```

---

## Troubleshooting

- **`better-sqlite3` gagal build** → pastikan `build-essential python3` terpasang, lalu `npm rebuild better-sqlite3`.
- **Slash command tidak muncul** → set `DISCORD_GUILD_ID` (global butuh ~1 jam), jalankan ulang `npm run deploy-commands`.
- **Tracker tidak update harga** → cek `PRICE_SOURCE=idx` dan `IDX_API_URL`; lihat `pm2 logs rise-tracker`.
- **Broadcast Discord dari tracker kosong** → set `DISCORD_SIGNAL_CHANNEL_ID`.
- **Port 3000 sudah dipakai** → ubah `API_PORT` di `.env`, sesuaikan `proxy_pass` nginx.
