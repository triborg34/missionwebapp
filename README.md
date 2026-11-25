<img src="assets/icon.svg" width="64" height="64" alt="">

# سامانه مدیریت و صدور برگه مأموریت سازمانی

A Persian (RTL) web application for organizational mission requests. Employees submit mission requests, managers approve or reject them, and approved missions produce an official A4 PDF with the manager's signature and stamp.

**Stack:** React + Vite + TypeScript + Tailwind (client) · Node.js + Express 5 + TypeScript + Prisma + SQLite (server) · Puppeteer-core for PDF rendering.

---

## Contents

1. [Requirements](#1-requirements)
2. [Quick start (development)](#2-quick-start-development)
3. [Default accounts and passwords](#3-default-accounts-and-passwords)
4. [First-run setup](#4-first-run-setup)
5. [Roles and what each can do](#5-roles-and-what-each-can-do)
6. [Configuration (`.env`)](#6-configuration-env)
7. [Available scripts](#7-available-scripts)
8. [Production build and run](#8-production-build-and-run)
9. [Backup and restore](#9-backup-and-restore)
10. [Project structure](#10-project-structure)
11. [Troubleshooting](#11-troubleshooting)
12. [Security notes](#12-security-notes)

For a full Ubuntu VPS deployment (Nginx, HTTPS, systemd, firewall, backup cron), see **[DEPLOY.md](DEPLOY.md)**.

---

## 1. Requirements

| Item | Version / note |
|---|---|
| Node.js | 22 LTS recommended (Node 20.19+ also works). Check with `node -v`. |
| npm | Comes with Node. |
| Google Chrome, Chromium or Microsoft Edge | Needed only to render PDFs. Auto-detected; set `CHROME_PATH` in `.env` if not found. |
| Operating system | Linux (Ubuntu 22.04/24.04 recommended for production), Windows or macOS for development. |

No external database server is needed: data is stored in a SQLite file.

---

## 2. Quick start (development)

Run these commands from the project root.

### 2.1 Install dependencies

```bash
cd server
npm install
cd ../client
npm install --legacy-peer-deps
cd ..
```

> `--legacy-peer-deps` is required for the client because `react-multi-date-picker` declares an older React peer range.

### 2.2 Configure the server

```bash
cp .env.example server/.env
```

Edit `server/.env` if needed. For local development the defaults are enough, but set `COOKIE_SECURE=false` (the default in the example is `true`, which only works over HTTPS):

```env
DATABASE_URL="file:./dev.db"
PORT=4000
COOKIE_SECURE=false
```

> The database path is relative to `server/prisma/`, so `file:./dev.db` creates `server/prisma/dev.db`.

### 2.3 Create the database and seed demo accounts

```bash
cd server
npx prisma migrate deploy
npm run db:seed
```

The seed creates the demo accounts listed in [section 3](#3-default-accounts-and-passwords). It is idempotent: running it again skips existing accounts and does not modify them.

### 2.4 Start the server and the client

Open two terminals.

**Terminal 1 – API server (port 4000):**

```bash
cd server
npm run dev
```

**Terminal 2 – Web client (port 5173):**

```bash
cd client
npm run dev
```

Open **http://localhost:5173** in your browser. The Vite dev server proxies `/api` requests to the API on port 4000.

> On some Windows systems `localhost` resolves to IPv6 only. If the page does not load, use `http://127.0.0.1:5173`.

---

## 3. Default accounts and passwords

The seed creates these accounts. **All of them use the default password `123456`** and must change it at first login.

| Username | Full name | Role | Department | Reports to | Employee code |
|---|---|---|---|---|---|
| `admin` | مدیر سامانه | ADMIN | مدیریت | – | A-001 |
| `manager1` | مدیر نمونه مالی | MANAGER | مالی و اداری | – | M-001 |
| `manager2` | مدیر نمونه فناوری | MANAGER | فناوری اطلاعات | – | M-002 |
| `employee1` | کارمند نمونه یک | EMPLOYEE | مالی و اداری | manager1 | E-001 |
| `employee2` | کارمند نمونه دو | EMPLOYEE | مالی و اداری | manager1 | E-002 |
| `employee3` | کارمند نمونه سه | EMPLOYEE | فناوری اطلاعات | manager2 | E-003 |
| `employee4` | کارمند نمونه چهار | EMPLOYEE | فناوری اطلاعات | manager2 | E-004 |
| `employee5` | کارمند نمونه پنج | EMPLOYEE | مدیریت | manager1 | E-005 |

- **Default password:** `123456`
- **Forced change:** after the first login with the default password, every user must choose a new password. New passwords must be 8–72 characters, contain at least one letter and one digit, and cannot be `123456`.
- **Admin cannot see passwords.** Passwords are stored only as bcrypt hashes. Admins can reset a user's password to `123456`, which forces that user to change it again.

> **Seed accounts are for development and demos only.** In production, change every default password immediately, or delete the demo accounts from the admin panel and create real ones. Never deploy with `123456` active for real users.

---

## 4. First-run setup

On a fresh database (no admin yet), the app redirects to **`/setup`**. There you:

1. Enter the organization name and optionally upload a logo (PNG/JPG, max 2 MB).
2. Create the first administrator (username, full name, password).
3. Enter the **setup token** if `SETUP_TOKEN` is set in `.env`.

If you run `npm run db:seed`, an admin already exists, so `/setup` is closed (it returns "already set up"). The seeded `admin` account (password `123456`) is then the first admin.

To start with a completely empty system instead of demo data, skip the seed, run only `npx prisma migrate deploy`, and use `/setup`.

---

## 5. Roles and what each can do

| Role | Persian label | Main abilities |
|---|---|---|
| **EMPLOYEE** | کارمند | Submit mission requests, edit or cancel **pending** requests only, view own missions, download the PDF of approved missions. |
| **MANAGER** | مدیر سازمان | See requests from the employees assigned to them, approve (with an automatic PDF snapshot) or reject with a reason, upload their own signature and stamp, set their official title. Managers have no admin rights. |
| **ADMIN** | ادمین سامانه | Dashboard and reports, full user management (create, edit, deactivate, reset password, assign role/department/employee code), manage managers' signature assets, organization name/logo, audit log, all missions. |

Rules enforced by the server (not just the UI):

- Approved and rejected requests are immutable for employees.
- Only the assigned manager (or an admin) can decide a request.
- Rejection requires a reason (5–1000 characters).
- Every decision and sensitive change is written to the audit log.
- Approved PDFs are generated from a frozen snapshot and do not change when settings, signature, or stamp change later.

---

## 6. Configuration (`.env`)

The server reads `server/.env` (copied from the root `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite file, relative to `server/prisma/`. |
| `PORT` | `4000` | API server port. |
| `NODE_ENV` | `production` in the example | Set `development` for local debugging. |
| `STORAGE_DIR` | `../storage` | Uploaded images and frozen approval files. Relative to `server/`. Back it up. |
| `CLIENT_DIST_DIR` | `../client/dist` | Built client served by the API in production. |
| `SESSION_TTL_HOURS` | `8` | Absolute session lifetime. |
| `IDLE_TIMEOUT_MINUTES` | `60` | Logout after this many idle minutes. |
| `COOKIE_SECURE` | `true` | Must be `true` over HTTPS; set `false` for plain-HTTP local development. |
| `TRUST_PROXY` | `1` | Number of reverse-proxy hops (1 behind Nginx). |
| `CHROME_PATH` | empty | Path to Chrome/Chromium/Edge for PDFs. Empty = auto-detect. |
| `SETUP_TOKEN` | empty | Protects `/setup` on public servers. Generate with `openssl rand -hex 24`. |

Other fixed limits: uploads max 2 MB (PNG/JPG only, checked by file signature), login locks for 15 minutes after 5 failed attempts.

---

## 7. Available scripts

**Server (`server/`)**

| Command | Does |
|---|---|
| `npm run dev` | Start API with auto-reload (tsx). |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Run the compiled server (`dist/index.js`). |
| `npx prisma migrate deploy` | Apply migrations to the database (production). |
| `npx prisma migrate dev` | Create/apply migrations during development. |
| `npm run db:seed` | Create demo accounts (idempotent). |
| `npm run typecheck` | Type-check the server. |

**Client (`client/`)**

| Command | Does |
|---|---|
| `npm run dev` | Dev server on port 5173 with `/api` proxy. |
| `npm run build` | Type-check and build to `client/dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run typecheck` | Type-check the client. |

---

## 8. Production build and run

```bash
# 1. Server
cd server
npm ci
npx prisma migrate deploy
npm run build

# 2. Client
cd ../client
npm ci --legacy-peer-deps
npm run build

# 3. Start (from server/, so relative paths resolve)
cd ../server
NODE_ENV=production npm start
```

Then open **http://localhost:4000**. The API server serves the built client, so one process is enough. For HTTPS, a domain, systemd service, and Nginx, follow [DEPLOY.md](DEPLOY.md).

Set `COOKIE_SECURE=true` and `SETUP_TOKEN` before exposing the app to the internet.

---

## 9. Backup and restore

Back up **two things together**: the SQLite database and the `storage/` directory. Also keep a copy of `server/.env`.

**Manual backup** (from `server/`):

```bash
mkdir -p ../backups
sqlite3 prisma/dev.db ".backup '../backups/db-$(date +%F).sqlite'"
tar -czf ../backups/storage-$(date +%F).tar.gz ../storage
cp .env ../backups/env-$(date +%F).txt
```

> Use the database file from your `DATABASE_URL`. The `.backup` command gives a consistent copy even while the app runs. Do not just copy `dev.db` during heavy writes.

**Restore:**

```bash
# stop the server first
cp ../backups/db-YYYY-MM-DD.sqlite prisma/dev.db
rm -rf ../storage && tar -xzf ../backups/storage-YYYY-MM-DD.tar.gz -C ..
# start the server again
```

The DEPLOY.md file includes an automated backup script with retention and a cron example.

---

## 10. Project structure

```
missionwebapp/
├── client/                  React + Vite front end (Persian RTL UI)
│   └── src/
│       ├── pages/           login, dashboard, missions, manager, admin, profile
│       ├── components/      shared UI, layout and navigation
│       ├── context/         authentication state
│       └── lib/             API helper, formatting, types
├── server/
│   ├── prisma/              schema, migrations, seed script
│   └── src/
│       ├── routes/          HTTP routes (auth, missions, manager, admin, setup)
│       ├── services/        business logic (missions, PDF, Excel export, assets)
│       ├── middleware/      session auth and role checks
│       └── lib/             security, validation, audit, storage, Jalali dates
├── storage/                 uploads and frozen approval files (created at runtime)
├── .env.example             configuration template
├── DEPLOY.md                Ubuntu production deployment guide
└── README.md
```

---

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `ERESOLVE` error when installing the client | Use `npm install --legacy-peer-deps` in `client/`. |
| Login works but the page immediately logs out (development) | Set `COOKIE_SECURE=false` in `server/.env` and restart the server. |
| Browser shows a blank page on `localhost:5173` | Use `http://127.0.0.1:5173`, or check that the API is running on port 4000. |
| `/api` returns errors on the client | Make sure the server (`npm run dev` in `server/`) is running on port 4000. |
| PDF generation fails | Install Chrome, Chromium, or Edge, and set `CHROME_PATH` in `server/.env`. |
| `Prisma` cannot find the database | Run `npx prisma migrate deploy` in `server/` and check `DATABASE_URL`. |
| Uploaded signature/stamp rejected | Only PNG, JPG, or JPEG files up to 2 MB are accepted. |
| Forgot a password | An admin can reset it to `123456` from the user management page. |
| Locked out after failed logins | Wait 15 minutes, or have an admin reset the password (this also clears the lock). |
| `/setup` is closed | An admin already exists. Log in with an admin account. |

---

## 12. Security notes

- Passwords are hashed with bcrypt (12 rounds). Admins cannot view them.
- Sessions use HTTP-only, SameSite=Strict cookies, with idle and absolute timeouts; sessions are revoked on password reset.
- Authorization is enforced on the server for every route.
- Uploaded files are validated by content signature, renamed randomly, and served only through authorized routes.
- Rate limiting, secure HTTP headers (Helmet), input validation (Zod), and audit logging are enabled.
- Change all default passwords and set `SETUP_TOKEN` before any public deployment.
