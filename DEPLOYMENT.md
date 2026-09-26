# Deploying CafeFlow POS

This guide covers installing, configuring, updating and running CafeFlow POS in
production. For an overview of the project, see [README.md](README.md).

- [Requirements](#requirements)
- [Automated install (`deploy.sh`)](#automated-install-deploysh)
- [Enable HTTPS](#enable-https)
- [First-run setup wizard](#first-run-setup-wizard)
- [Manual install](#manual-install)
- [Configuration (`pos/.env`)](#configuration-posenv)
- [Database](#database)
- [Student ordering app](#student-ordering-app)
- [Updating](#updating)
- [Operations](#operations)
- [Production checklist](#production-checklist)
- [Troubleshooting](#troubleshooting)

---

## Requirements

| | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 20.04 / Debian 11 / RHEL, Rocky or AlmaLinux 8 | Ubuntu 22.04+ LTS |
| CPU / RAM | 2 cores / 2 GB | 4 cores / 4 GB+ |
| Disk | 20 GB | 50 GB |
| Node.js | 20.x | 20.x LTS |
| PostgreSQL | 14 | 16 |
| Redis | 5 | 6+ |

You also need a DNS A record for the POS domain that points at the server.

---

## Automated install (`deploy.sh`)

`deploy.sh` turns a bare server into a running installation. Run it as root:

```bash
# From a clone (recommended)
git clone https://github.com/mk-manishkandel/cafeflow.git /opt/cafeflow
sudo bash /opt/cafeflow/deploy.sh

# Or without cloning first; the script clones the repo itself
bash <(curl -fsSL https://raw.githubusercontent.com/mk-manishkandel/cafeflow/main/deploy.sh)
```

It prompts for the install directory (if not run from inside a clone), POS domain,
database name/user/password, Redis password and timezone. It shows a summary and asks
for confirmation before it changes anything. JWT and encryption secrets are always
auto-generated.

### Options

| Flag | Effect |
|------|--------|
| `--non-interactive` | No prompts; configuration is read from environment variables (below). |
| `--rebuild` | Skip the installer. Reinstall dependencies, back up the database, apply the schema, rebuild the frontend and reload PM2 with no downtime (for use after code changes). |
| `--help` | Show usage. |

Environment variables for `--non-interactive`:

| Variable | Required | Default |
|----------|----------|---------|
| `POS_DOMAIN` | yes | none |
| `DB_NAME` / `DB_USER` | | `cafeflow` / `cafeflow_user` |
| `DB_PASSWORD` / `REDIS_PASSWORD` | | auto-generated |
| `TZ` | | `UTC` |
| `TLS_MODE` | | `proxy` (HTTPS terminated upstream, e.g. Cloudflare) or `certbot` |
| `LETSENCRYPT_EMAIL` | with `certbot` | none |
| `CAFEFLOW_DIR` | | `/opt/cafeflow` (used only when the script clones) |
| `CAFEFLOW_REPO` | | upstream GitHub URL (set this to install from a fork) |

```bash
export POS_DOMAIN=pos.example.com TZ=Asia/Kathmandu TLS_MODE=proxy
sudo -E bash deploy.sh --non-interactive
```

### What it does

1. **Preflight.** Detects the OS, checks for root and warns on low disk space or RAM.
2. **Configuration.** Collects the settings above, including how HTTPS is provided.
   If `pos/.env` already exists, its database, Redis and secret values are reused, so
   a re-run never changes passwords under a running app.
3. **Packages.** Installs Node.js 20 (NodeSource), PostgreSQL 16, 15 or 14 (PGDG),
   Redis, nginx and PM2.
4. **Repository.** Clones the repo, or uses the clone the script runs from.
5. **Database.** Creates the DB user and database, sets the database timezone and
   applies `pos/server/schema.sql` in a single transaction. If a `users` table already
   exists, it takes a `pg_dump` backup first; the schema is safe to re-apply.
6. **App.** Writes `pos/.env` (skipped if the file already exists), runs
   `npm install --omit=dev` in `pos/server`, then `npm install`, `npm run build` and
   `npm prune --omit=dev` in `pos`. It also generates the default Excel export
   templates, sets permissions and writes `ecosystem.config.cjs` with absolute paths.
7. **nginx.** Creates the `cafeflow-pos` site: `pos/dist` is served as static files,
   and `/api`, `/socket.io/` and `/health` are proxied to `127.0.0.1:3001`. The service
   worker and web manifest are served with no-cache headers so devices pick up updates.
8. **HTTPS.** With `TLS_MODE=certbot`, installs certbot and obtains a Let's Encrypt
   certificate (HTTP is redirected to HTTPS). With `proxy`, nothing changes on this server.
9. **Redis.** Binds Redis to `127.0.0.1`, sets `requirepass` and applies
   `maxmemory 256mb` / `allkeys-lru`.
10. **Security.** Configures UFW (Debian family) or firewalld (RHEL family) to allow
    SSH/80/443 and block 3001/5432/6379, and binds PostgreSQL to localhost.
11. **PM2.** Starts `cafeflow-pos` in cluster mode with a clean environment (so
    `pos/.env` is the only source of settings), registers it with systemd, runs
    `pm2 save` and polls `/health`.
12. **Backups.** Installs `/usr/local/bin/backup-cafeflow.sh` with a daily 02:00 cron
    job, plus a logrotate config for app and PM2 logs.
13. **Summary.** Prints the URLs and writes the generated credentials to
    `/root/.cafeflow-credentials` (mode 600). Secrets are never printed to the terminal.
    Move them to a password manager and delete the file.

The script is safe to re-run. It keeps an existing database, `pos/.env` (including
its passwords and secrets) and applied schema.

> **Installing on another server:** `deploy.sh` clones from `CAFEFLOW_REPO` (GitHub by
> default), so push your latest commits first, or the new server gets old code.

---

## Enable HTTPS

In production (`NODE_ENV=production`) the server sets its auth and CSRF cookies with the
`Secure` flag, so **login fails unless the site is opened over `https://`**. `deploy.sh`
asks how HTTPS is provided (`TLS_MODE`):

- **`proxy`** (default): HTTPS is terminated in front of this server, for example by
  Cloudflare or a tunnel. Point it at nginx on port 80. This is how the main
  `pos.bic.edu.np` server runs.
- **`certbot`**: `deploy.sh` gets a Let's Encrypt certificate on this server. The
  domain must already point here and port 80 must be reachable from the internet.
  Renewal is automatic (certbot's systemd timer).

Either way, `pos/.env` uses the `https://` origin:

```bash
CORS_ORIGIN=https://pos.example.com
FRONTEND_URL=https://pos.example.com
```

If you change `.env` later, apply it with a clean restart so PM2 doesn't keep old values:
`pm2 delete cafeflow-pos && env -i PATH="$PATH" HOME="$HOME" pm2 start ecosystem.config.cjs && pm2 save`.

---

## First-run setup wizard

Open the POS URL in a browser. When the database has no users yet, the setup wizard
opens automatically:

1. Create the super admin username and password.
2. The Admin role (all permissions) and the "Main Branch" are created.
3. You're sent to the login page.

The wizard is permanently disabled once a user exists. Always create the first admin
through the wizard, not by inserting rows with SQL. After that, set up payment methods,
branches, roles, printers and email settings in **Business Setup**.

---

## Manual install

Use this path if Node.js 20, PostgreSQL 14+, Redis, nginx and PM2 are already installed.

```bash
git clone https://github.com/mk-manishkandel/cafeflow.git /opt/cafeflow
cd /opt/cafeflow

# 1. Database
sudo -u postgres psql -c "CREATE USER cafeflow_user WITH ENCRYPTED PASSWORD 'change_me';"
sudo -u postgres psql -c "CREATE DATABASE cafeflow OWNER cafeflow_user;"
sudo -u postgres psql -d cafeflow -c "ALTER DATABASE cafeflow SET timezone TO 'Asia/Kathmandu';"
psql -U cafeflow_user -h localhost -d cafeflow -f pos/server/schema.sql --single-transaction

# 2. Configuration: copy the template and fill in real values
#    (or run: bash scripts/setup-env.sh)
cp pos/.env.example pos/.env && chmod 600 pos/.env

# 3. Install and build. The full install is required because vite/tsc are
#    devDependencies; prune afterwards.
(cd pos/server && npm install --omit=dev)
(cd pos && npm install && npm run build && npm prune --omit=dev)
node pos/server/scripts/generateDefaultTemplates.cjs   # Excel export templates

# 4. Start
mkdir -p /var/log/cafeflow
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup          # run the command pm2 startup prints

# 5. Verify
curl http://127.0.0.1:3001/health
```

Configure nginx to serve `pos/dist` and proxy `/api`, `/socket.io/` (with WebSocket
upgrade headers) and `/health` to `127.0.0.1:3001`. The site `deploy.sh` generates
(`/etc/nginx/sites-available/cafeflow-pos`) is a working reference. Then
[enable HTTPS](#enable-https) and firewall off ports 3001, 5432 and 6379.

---

## Configuration (`pos/.env`)

A single `pos/.env` configures both the API server and the frontend build (`VITE_*`
variables are baked in at build time, so rebuild after changing them). The annotated
template is [`pos/.env.example`](pos/.env.example). The server validates its environment
at startup and exits if a required variable is missing or insecure.

| Variable | Required | Notes |
|----------|:-:|-------|
| `DB_PASSWORD` | ✓ | Also `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` (default `localhost`/`5432`); `DB_POOL_MAX` (default 80, shared across PM2 workers; keep it below PostgreSQL `max_connections`) |
| `JWT_SECRET`, `REFRESH_TOKEN_SECRET` | ✓ | At least 32 characters each, and they must differ |
| `DB_ENCRYPTION_SECRET` | ✓ | At least 32 characters. Encrypts stored secrets such as the SMTP password. **Keep it stable**, because changing it makes existing encrypted values unreadable |
| `DB_ENCRYPTION_SALT` | recommended | Independent salt (`openssl rand -hex 16`). Keep it stable once set |
| `TZ` | ✓ | IANA timezone for server, SQL and cron |
| `VITE_APP_TIMEZONE` | ✓ | Same value as `TZ`, used by the frontend |
| `CORS_ORIGIN` | ✓ | Comma-separated allowed origins; `*` is rejected in production |
| `PORT` | | API port. Use `3001`, which nginx and `update.sh` expect (the code defaults to 5000) |
| `NODE_ENV` | | `production` on servers |
| `REDIS_URL` | | `redis://:PASSWORD@127.0.0.1:6379` |
| `FRONTEND_URL` | | Public POS URL; adds `wss://<host>` to the Content Security Policy |
| `LOG_LEVEL` | | `error` / `warn` / `info` / `debug` |
| `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN` | | Defaults `15m` / `7d` |
| `STUDENT_ORDER_ALLOWED_ORIGIN` | for student app | See [Student ordering app](#student-ordering-app) |
| `STUDENT_CLIENT_SECRET` | | Optional `x-cafeflow-client` shared secret for student ordering |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SYSTEM_NOTIFICATION_EMAIL`, `SYSTEM_ADMIN_EMAIL` | | Fallback only; SMTP is normally set in Business Setup → Email Settings |
| `GEMINI_API_KEY` | | Enables AI category suggestions in the menu editor |
| `PRINT_SWEEP_MINUTES` | | Background job tuning |
| `VITE_ALLOWED_HOSTS`, `VITE_API_URL` | | Vite dev server only |

Generate secrets with `openssl rand -base64 48 | tr -d '/+'`.

`bash scripts/setup-env.sh` is an interactive generator for `pos/.env`. On an existing
file it keeps the current `DB_ENCRYPTION_SECRET` and `DB_ENCRYPTION_SALT` (changing them
would make stored SMTP passwords unreadable) unless you pass `--rotate-encryption-key`,
carries over keys it doesn't manage (SMTP, student ordering, and so on), and saves the
previous file as `pos/.env.bak.<timestamp>`. Regenerating the JWT secrets logs everyone out.

---

## Database

The complete schema lives in one file, **`pos/server/schema.sql`**. There is no
migrations directory. The file is idempotent: it creates a fresh database in its final
state and can be re-applied to an existing one to bring it up to date. `deploy.sh`,
`deploy.sh --rebuild` and `scripts/update.sh` apply it automatically (after a backup):

```bash
psql -U cafeflow_user -h localhost -d cafeflow -f pos/server/schema.sql --single-transaction
```

The schema creates monthly partitions for the transaction and audit tables. The server
keeps rolling partitions ahead of time and refreshes the reporting materialized views
on a schedule, so these need no manual work.

Re-applying on an existing install removes data belonging to retired modules
(inventory, coupons, table orders, custom report templates), if any is still present.
It uses `lock_timeout`, so on a busy database it fails cleanly rather than blocking
traffic; just re-run it.

---

## Student ordering app

`student-order/` is a separate static app. Students choose a branch, browse today's
menu (items flagged "today's menu" in the POS) and place an order. The cashier then
loads it by order ID in the **POS-N terminal**. The app calls the backend with relative
`/api/public/...` URLs, so it must be served from a host that proxies `/api` to the POS
backend.

```bash
cd student-order && npm install && npm run build   # output: student-order/dist
```

1. Serve `student-order/dist` on its own domain (for example `order.example.com`) and
   proxy `/api` to `http://127.0.0.1:3001` with the same headers as the POS site.
   `deploy.sh` and `update.sh` don't build or serve this app, so set this up yourself.
2. In `pos/.env`, set `STUDENT_ORDER_ALLOWED_ORIGIN=https://order.example.com` and add
   that origin to `CORS_ORIGIN`. The student menu and order endpoints reject any request
   whose `Origin` header doesn't match exactly.
3. Turn on self-service in the branch's settings, and mark menu items as today's menu
   in the menu editor.

The API contract is documented in [docs/API.md](docs/API.md#part-2-student-ordering-api).

---

## Updating

Back up first. `update.sh` takes a database backup, but an extra copy costs nothing.

```bash
cd /opt/cafeflow
sudo bash scripts/update.sh
```

`update.sh`:

1. Checks prerequisites. It needs root, Node 20+, PM2 running `cafeflow-pos` and `pos/.env`.
2. Backs up the database with `pg_dump` (as the `postgres` superuser) to
   `/var/backups/cafeflow/pre-update_<timestamp>.sql.gz`.
3. Fetches, shows the pending commits and pulls. Local changes are stashed.
4. Builds: `npm install --omit=dev` in `pos/server`, then full install, build and prune
   in `pos`. It also regenerates the Excel templates.
5. Applies `pos/server/schema.sql`. If this fails, the code is rolled back and the
   database is left unchanged.
6. Runs `pm2 reload ecosystem.config.cjs`, a rolling cluster restart with no downtime.
7. Polls `http://localhost:3001/health` for up to 30 s.
8. If the health check fails, reverts the code, rebuilds and reloads automatically.

Alternatives:

- `sudo bash deploy.sh --rebuild` works on the code already checked out (no pull): it
  reinstalls dependencies, backs up the database, applies the schema, rebuilds the
  frontend and reloads PM2 with no downtime.
- Manually: `git pull`, then run the build commands from [Manual install](#manual-install)
  step 3, then `pm2 reload ecosystem.config.cjs`.

### Rolling back

```bash
git log --oneline -5                       # find the previous commit
git checkout <previous-commit> -- .
(cd pos && npm install && npm run build && npm prune --omit=dev)
pm2 reload ecosystem.config.cjs
```

To restore the database as well, stop the app first (this loses anything written after
the backup):

```bash
pm2 stop cafeflow-pos
sudo -u postgres dropdb cafeflow
sudo -u postgres createdb -O cafeflow_user cafeflow
# pg_dump turns row security off, which makes the two materialized-view refreshes
# at the end of the dump fail; skip them and refresh afterwards.
gunzip -c /var/backups/cafeflow/<file>.sql.gz | sed '/^REFRESH MATERIALIZED VIEW /d' \
  | sudo -u postgres psql -q -v ON_ERROR_STOP=1 cafeflow
sudo -u postgres psql cafeflow -c 'REFRESH MATERIALIZED VIEW mv_branch_daily_sales; REFRESH MATERIALIZED VIEW mv_item_sales_summary;'
pm2 start cafeflow-pos
```

---

## Operations

### PM2

The app runs as a single PM2 app, **`cafeflow-pos`**, in cluster mode (one worker per
CPU core, 500 MB memory limit per worker). Socket.IO events are shared across workers
through Redis.

```bash
pm2 list                          # status
pm2 logs cafeflow-pos             # tail logs
pm2 monit                         # live CPU/memory
pm2 reload ecosystem.config.cjs   # zero-downtime restart (preferred)
pm2 restart cafeflow-pos          # hard restart
```

### Logs

| Log | Location |
|-----|----------|
| PM2 stdout/stderr | `/var/log/cafeflow/pos-out.log`, `/var/log/cafeflow/pos-error.log` |
| Application (winston, daily rotation) | `pos/server/logs/` |
| nginx | `/var/log/nginx/` |
| Backup job | `/var/log/cafeflow-backup.log` |

### Backups

`deploy.sh` installs `/usr/local/bin/backup-cafeflow.sh`, which runs daily at 02:00 and
writes to `/var/backups/cafeflow/`:

- `db_<timestamp>.sql.gz`, a `pg_dump` of the database, taken as the `postgres`
  superuser (the app role can't dump tables with row-level security)
- files older than 30 days are deleted

Uploaded images (menu photos) are not backed up. Run the backup manually with
`/usr/local/bin/backup-cafeflow.sh`; the log line shows the file size, and a complete
dump is several MB, not a few hundred KB. To restore, follow
[Rolling back](#rolling-back). Copy backups off the server regularly.

### Health check

```bash
curl -s http://127.0.0.1:3001/health
```

Requests from localhost or a private network get the full report (database, Redis,
pool, memory and version). Public requests only get `{"status":"ok"}`.

### Maintenance

| Frequency | Task |
|-----------|------|
| Daily | Check `pm2 list` / error logs; confirm the backup ran |
| Weekly | Review Audit Logs in the admin panel; test-restore a backup |
| Monthly | `bash scripts/update.sh`; OS security updates; `VACUUM ANALYZE` |
| Quarterly | Review firewall rules and user accounts; revoke unused API keys |

---

## Production checklist

**Before go-live**

- [ ] Served over HTTPS with a valid certificate; `CORS_ORIGIN` lists only `https://` origins
- [ ] `pos/.env` is mode 600. Secrets are random, at least 32 characters, and `JWT_SECRET` ≠ `REFRESH_TOKEN_SECRET`
- [ ] `DB_ENCRYPTION_SECRET` and `DB_ENCRYPTION_SALT` are stored somewhere safe outside the server
- [ ] `TZ` and `VITE_APP_TIMEZONE` match (rebuild the frontend after changing them)
- [ ] Redis has a password and is bound to 127.0.0.1; PostgreSQL listens on localhost only
- [ ] Firewall allows only SSH, 80 and 443 (`curl http://<server-ip>:3001` from outside is refused)
- [ ] Setup wizard completed; the admin has a strong password
- [ ] Credentials moved out of `/root/.cafeflow-credentials` and the file deleted
- [ ] Backup cron is present (`crontab -l`) and a test restore works
- [ ] Student ordering (if used): `STUDENT_ORDER_ALLOWED_ORIGIN` set and origin added to `CORS_ORIGIN`

**Smoke test**

- [ ] `pm2 list` shows `cafeflow-pos` online on every core
- [ ] `/health` from the server reports database and Redis `ok`
- [ ] Log in, make a test sale, and check that it appears in Transactions and on the Dashboard
- [ ] Real-time updates reach a second browser tab
- [ ] Changing a logged-in user's role logs their session out immediately
- [ ] A menu image upload works and displays
- [ ] A test print reaches each configured network printer
- [ ] A test email is sent (if SMTP is configured)

---

## Troubleshooting

**App won't start**

```bash
pm2 logs cafeflow-pos --lines 100
lsof -i :3001                     # port already in use?
```

`Missing required environment variables` or `ENVIRONMENT VALIDATION FAILED` means
`pos/.env` is missing a required variable or has an invalid value. See
[Configuration](#configuration-posenv).

**Login fails or you're logged out immediately.** The site is being served over HTTP
while `NODE_ENV=production`. See [Enable HTTPS](#enable-https).

**Database connection errors**

```bash
systemctl status postgresql
psql -U cafeflow_user -h localhost -d cafeflow -c "SELECT 1;"
```

`relation/column does not exist` after an update means a schema change hasn't been
applied. See [Database](#database).

**`NOAUTH Authentication required` (Redis).** The password in `REDIS_URL` doesn't
match `requirepass` in the Redis config (`/etc/redis/redis.conf` or `/etc/redis.conf`).
Fix it, then restart Redis (`redis-server` or `redis` service) and reload PM2.

**`Cannot find module ...`.** Dependencies are out of sync. Run
`(cd pos/server && npm install --omit=dev)` and
`(cd pos && npm install && npm run build && npm prune --omit=dev)`, then reload PM2.

**Build fails with `vite: not found`.** You ran `npm install --omit=dev` before building.
Run a full `npm install` in `pos/`.

**Student app gets 403.** The request's `Origin` doesn't exactly match
`STUDENT_ORDER_ALLOWED_ORIGIN`, or self-service is disabled for the branch. A 401 means
`STUDENT_CLIENT_SECRET` is set but the client isn't sending `x-cafeflow-client`.

**nginx**

```bash
nginx -t && systemctl reload nginx
tail -f /var/log/nginx/error.log
```

**Health check fails after an update.** `update.sh` rolls back automatically. To
investigate, check `pm2 logs cafeflow-pos --lines 100`, then follow
[Rolling back](#rolling-back) if needed.
