# UnforgettableRides — Operations Playbook

*Last updated: 2026-07-01*

---

## Server Access (Canonical)

Use this host for UnforgettableRides operations:
- Public IP: `34.223.228.177`
- Expected hostname after login: `ip-172-26-12-235`
- Expected app path: `~/UnforgettableRides`
- SSH key: `~/.ssh/34.223.228.177-unforgettablerides-lightsonamerica.pem`

Windows/PowerShell example:
```powershell
ssh -i "$HOME/.ssh/34.223.228.177-unforgettablerides-lightsonamerica.pem" ubuntu@34.223.228.177
```

macOS/Linux example:
```bash
ssh -i ~/.ssh/34.223.228.177-unforgettablerides-lightsonamerica.pem ubuntu@34.223.228.177
```

After login, verify:
```bash
hostname
pwd
ls -la ~/UnforgettableRides
```

Important:
- `44.245.183.72` and `34.211.20.239` are different/retired servers and should not be used for UnforgettableRides deploy/update work.
- The server working tree carries local production modifications (e.g. `.env.production`, compose files) and its `origin` remote is HTTPS without stored credentials, so `git pull` does not run non-interactively there. To ship a targeted fix, `scp` the changed files to the server and rebuild only the affected service (see Canonical AWS Deploy).

---

## Services Overview

| Service | Tech | Default Port | Start command |
|---|---|---|---|
| `rides-api` | Node.js + Express + SQLite | 3000 | `npm start` |
| `rides-admin` | React + Vite | 5173 | `npm run dev` |
| `rides-portal` | React + Vite | 5174 | `npm run dev` |
| `rides-app` | Expo (React Native) | 8081 | `npx expo start` |

---

## Local Development

### Start everything

```bat
start_all.bat
```

Or individually:

```bash
cd rides-api   && npm start          # API on :3000
cd rides-admin && npm run dev        # Admin on :5173
cd rides-portal && npm run dev       # Portal on :5174
cd rides-app   && npx expo start     # Mobile app
```

### First run

On first start, `rides-api` will:
1. Run all SQL migrations (including `0019_rides_up.sql` which creates the marketplace tables)
2. Seed an admin user at `admin@unforgettablerides.com` / `admin123`
3. Seed 12 sample classic cars with Unsplash placeholder images

---

## Environment Variables

Copy `.env.example` to `.env.local` in the project root and fill in:

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes (prod) | Secret for signing JWTs. Default is insecure. |
| `STRIPE_SECRET_KEY` | For payments | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | For payments | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | For payments | Sent to client |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | For email | Nodemailer SMTP config |
| `PUBLIC_APP_BASE_URL` | For email links | e.g. `https://unforgettablerides.com` |

---

## Database

The SQLite database file lives at `rides-api/src/data/analytics.db`.

### Migrations

Migrations live in `rides-api/migrations/`. They run automatically on startup in filename order. Each migration is recorded in the `schema_migrations` table and only applied once.

To roll back migration 0019:
```bash
sqlite3 rides-api/src/data/analytics.db < rides-api/migrations/0019_rides_down.sql
```

### Backup

```bash
sqlite3 rides-api/src/data/analytics.db ".backup rides-api/backup-$(date +%Y%m%d).db"
```

---

## Docker

```bash
docker-compose up          # dev
docker-compose -f docker-compose.production.yml up -d   # prod
```

Services: `rides-api`, `rides-admin`, `rides-portal`, `rides-app-web`.

### Production Ports (Docker)

- Admin: `8080`
- Portal: `8082` by default (`PORTAL_PORT` can override, for example `8083`)
- App web: `8081`
- API is reverse-proxied from web services under `/api/*`

### Canonical AWS Deploy

Use auto-select deploy script (CPU/GPU aware):

```bash
cd ~/UnforgettableRides
git pull
./scripts/deploy-auto.sh
```

This now deploys:
- `rides-api`
- `rides-admin`
- `rides-portal`
- `rides-app-web`
- `ml-service` (when `ml-models/` is present)

### If Portal Fails to Start (`8082 already in use`)

```bash
cd ~/UnforgettableRides
docker ps -aq --filter "publish=8082" | xargs -r docker rm -f
pm2 stop rides-portal 2>/dev/null || true
pm2 delete rides-portal 2>/dev/null || true
pid=$(sudo lsof -t -i:8082 -sTCP:LISTEN 2>/dev/null || true)
[ -n "$pid" ] && sudo kill -9 "$pid" || true
./scripts/deploy-auto.sh
```

Alternative (recommended if `8082` is used by Expo or another service):

```bash
cd ~/UnforgettableRides
if grep -q '^PORTAL_PORT=' .env; then
  sed -i 's/^PORTAL_PORT=.*/PORTAL_PORT=8083/' .env
else
  printf '\nPORTAL_PORT=8083\n' >> .env
fi
./scripts/deploy-auto.sh
```

---

## PM2 (Production)

```bash
pm2 start ecosystem.config.js
pm2 logs rides-api
pm2 reload rides-api
```

---

## Deployment Checklist

- [ ] Set `JWT_SECRET` to a strong random value
- [ ] Configure Stripe keys
- [ ] Configure SMTP for email delivery
- [ ] Set `NODE_ENV=production`
- [ ] Point `PUBLIC_APP_BASE_URL` at your domain
- [ ] Replace `admin@unforgettablerides.com` seed account with a real admin account
- [ ] Set up SSL (nginx/Caddy in front of the Node server)
- [ ] Configure regular SQLite backups

