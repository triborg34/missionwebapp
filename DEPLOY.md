# Production deployment (Ubuntu VPS)

This guide deploys the mission management system on a single Ubuntu 22.04 or 24.04 server behind Nginx with HTTPS. The app runs as a systemd service, stores data in SQLite, and renders PDFs with a locally installed Chrome.


## Quick install (wizard)

On a fresh Ubuntu server, log in as `root` and run the interactive installer from a checkout of this repository. It asks a few questions (domain, e-mail for HTTPS, local app port, HTTPS certificate (Let's Encrypt or your own files), organization name, demo accounts, Chrome, backups), shows a summary, then installs and configures everything described below:

```bash
sudo -i
cd /root && git clone <your-repo-url> missionwebapp && cd missionwebapp
bash deploy/install.sh
```

The installer generates `server/.env` (including a random `SETUP_TOKEN`), builds the server and client, runs migrations, creates the systemd service, Nginx site, HTTPS certificate, UFW rules and daily backups. Its summary is also saved to `/root/missionapp-install-info.txt`.

Re-running `bash /opt/missionapp/deploy/install.sh` updates an existing install and keeps `server/.env` and the data. The manual steps below are the same work, step by step.

## 1. Requirements

- Ubuntu 22.04/24.04 with root or sudo access, and a domain name pointing at the server's IP (required for HTTPS).
- Node.js 22 LTS or newer.
- Nginx, Certbot, SQLite CLI (for backups).
- Google Chrome (used for PDFs; Puppeteer does not download a browser in this project).

```bash
# Base packages
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx sqlite3 curl ca-certificates gnupg

# Node.js 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Google Chrome (for PDF generation)
curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt update && sudo apt install -y google-chrome-stable
which google-chrome-stable   # usually /usr/bin/google-chrome-stable
```

## 2. Create directories

The whole deployment runs as `root` (log in as root, or use `sudo -i`). All commands below run as root.

```bash
mkdir -p /opt/missionapp /var/lib/missionapp/storage /var/lib/missionapp/db /var/backups/missionapp
```

- `/opt/missionapp` – application code
- `/var/lib/missionapp/db` – SQLite database (kept outside the code folder)
- `/var/lib/missionapp/storage` – uploaded signatures, stamps, logo, frozen approval copies
- `/var/backups/missionapp` – backups

## 3. Deploy the code

Copy the project into `/opt/missionapp` (git clone or rsync from your machine, excluding `node_modules`):

```bash
git clone <your-repo-url> /opt/missionapp
# or, from your workstation:
# rsync -av --exclude node_modules --exclude dist --exclude storage ./ user@server:/tmp/missionapp/ && sudo cp -a /tmp/missionapp/. /opt/missionapp/
```

Install dependencies and build:

```bash
cd /opt/missionapp/server
npm ci
npm run build

cd /opt/missionapp/client
npm ci --legacy-peer-deps
npm run build
```

## 4. Configure the environment

Create `/opt/missionapp/server/.env` from the template and fill in the production values:

```bash
cp /opt/missionapp/.env.example /opt/missionapp/server/.env
nano /opt/missionapp/server/.env
```

Set at least these values (the server reads `.env` from its working directory, `server/`):

```ini
NODE_ENV=production
PORT=4000
DATABASE_URL="file:/var/lib/missionapp/db/app.db"
STORAGE_DIR=/var/lib/missionapp/storage
CLIENT_DIST_DIR=/opt/missionapp/client/dist
COOKIE_SECURE=true
TRUST_PROXY=1
CHROME_PATH=/usr/bin/google-chrome-stable
SETUP_TOKEN=<output of: openssl rand -hex 24>
```

Keep the file readable only by the service user:

```bash
sudo chmod 600 /opt/missionapp/server/.env
```

## 5. Initialize the database

```bash
cd /opt/missionapp/server
npx prisma migrate deploy
```

Do **not** run the seed script in production unless you want demo accounts (`npm run db:seed` creates 1 admin, 2 managers, 5 employees with password `123456`). For a real deployment, skip the seed and use the first-run setup page instead (next step).

## 6. Run as a systemd service

Create `/etc/systemd/system/missionapp.service`:

```ini
[Unit]
Description=Mission management system
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/missionapp/server
EnvironmentFile=/opt/missionapp/server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/missionapp /tmp
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`ReadWritePaths` must include `/var/lib/missionapp` (database and uploads). Puppeteer writes temporary profiles under `/tmp`, which is also allowed.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now missionapp
sudo systemctl status missionapp --no-pager
curl -s http://127.0.0.1:4000/api/setup/status
```

## 7. Nginx reverse proxy with HTTPS

Create `/etc/nginx/sites-available/missionapp`:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    client_max_body_size 3m;   # uploads are limited to 2 MB by the app

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Enable it and get a certificate:

```bash
sudo ln -s /etc/nginx/sites-available/missionapp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.example --redirect
```

Certbot installs automatic renewal. Check it with `sudo certbot renew --dry-run`.

The firewall should allow only SSH and web traffic; port 4000 stays private:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

## 8. First-run setup

1. Open `https://your-domain.example/setup` (or `/api/setup/status` to confirm the API is up).
2. Enter `SETUP_TOKEN`, the organization name, the logo (PNG/JPG, max 2 MB), and the first administrator's username and password.
3. Setup refuses to run again once an administrator exists.

Log in with the new admin account, then create departments, managers, and employees from the admin panel.

## 9. Backups and restore

The system has two pieces of data that must be backed up together: the SQLite database and the storage folder.

### Backup

Create `/usr/local/bin/missionapp-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DEST=/var/backups/missionapp
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST"

# Consistent online copy of the SQLite database
sqlite3 /var/lib/missionapp/db/app.db ".backup '$DEST/app-$STAMP.db'"

# Uploaded assets and frozen approval copies
tar -C /var/lib/missionapp -czf "$DEST/storage-$STAMP.tar.gz" storage

# Keep the environment file (contains SETUP_TOKEN, must be stored securely)
cp /opt/missionapp/server/.env "$DEST/env-$STAMP.txt" && chmod 600 "$DEST/env-$STAMP.txt"

# Keep 30 days
find "$DEST" -type f -mtime +30 -delete
echo "Backup written: $STAMP"
```

```bash
sudo chmod +x /usr/local/bin/missionapp-backup.sh
sudo /usr/local/bin/missionapp-backup.sh
```

Schedule it daily with cron (`sudo crontab -e`):

```cron
30 2 * * * /usr/local/bin/missionapp-backup.sh >> /var/log/missionapp-backup.log 2>&1
```

Copy the backup folder off the server regularly (another host, object storage, or a backup service). A backup on the same disk does not protect against disk failure.

### Restore

```bash
sudo systemctl stop missionapp

# Pick a timestamp from /var/backups/missionapp
STAMP=20260101-023000
sudo cp /var/backups/missionapp/app-$STAMP.db /var/lib/missionapp/db/app.db
sudo rm -rf /var/lib/missionapp/storage
sudo tar -C /var/lib/missionapp -xzf /var/backups/missionapp/storage-$STAMP.tar.gz

sudo systemctl start missionapp
curl -s http://127.0.0.1:4000/api/setup/status
```

Test a restore on a separate machine at least once. An untested backup is not a backup.

## 10. Updating the application

If the app was installed with `deploy/install.sh` (the normal case), `/opt/missionapp` has no `.git` folder. Update from the checkout you installed from:

```bash
sudo /usr/local/bin/missionapp-backup.sh          # back up first
cd /root/missionwebapp && git pull
sudo bash deploy/install.sh                       # answer the questions again (Enter keeps the shown values)
```

The installer keeps `server/.env` and the data, rebuilds, applies migrations, rewrites the Nginx site and restarts the service. Your HTTPS certificate is kept unless you enter a new one. UFW is only touched if it is already active.

Manual update (only without the installer):

```bash
sudo systemctl stop missionapp
cd /opt/missionapp && git pull
cd server && npm ci && npm run build
npx prisma migrate deploy      # applies new migrations
cd ../client && npm ci --legacy-peer-deps && npm run build
sudo systemctl start missionapp
```

## 11. Operations and troubleshooting

| Symptom | Check |
|---|---|
| 502 Bad Gateway | `systemctl status missionapp`, `journalctl -u missionapp -n 100` |
| PDF generation fails | `CHROME_PATH` points to an installed Chrome; the service user can run it; `/tmp` is writable |
| Login cookies not kept | Site must be served over HTTPS and `COOKIE_SECURE=true`; `TRUST_PROXY=1` when behind Nginx |
| Setup page asks for a token | Enter the `SETUP_TOKEN` value from `server/.env` |
| Upload rejected | Only PNG/JPG under 2 MB; Nginx `client_max_body_size` must be at least 3 MB |

Logs: `journalctl -u missionapp -f`. Restart after config changes: `sudo systemctl restart missionapp`.

## Security checklist

- `SETUP_TOKEN` is set, and setup has been completed.
- `server/.env` is mode `600` and is not in git.
- Port 4000 is not reachable from outside (`sudo ss -ltnp | grep 4000` shows `127.0.0.1`).
- HTTPS is active and HTTP redirects to HTTPS.
- Backups run daily, are copied off the server, and a restore has been tested.
- Demo accounts from the seed script are not present in production.
