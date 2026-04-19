# UnforgettableRides — Operations Playbook

*Last updated: 2026-04-19*

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
2. Seed an admin user at `admin@petcare.com` / `admin123`
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

The SQLite database file lives at `rides-api/petcare.db` (legacy filename — safe to rename).

### Migrations

Migrations live in `rides-api/migrations/`. They run automatically on startup in filename order. Each migration is recorded in the `schema_migrations` table and only applied once.

To roll back migration 0019:
```bash
sqlite3 rides-api/petcare.db < rides-api/migrations/0019_rides_down.sql
```

### Backup

```bash
sqlite3 rides-api/petcare.db ".backup rides-api/backup-$(date +%Y%m%d).db"
```

---

## Docker

```bash
docker-compose up          # dev
docker-compose -f docker-compose.production.yml up -d   # prod
```

Services: `rides-api`, `rides-admin`, `rides-portal`, `rides-app-web`.

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
- [ ] Replace `admin@petcare.com` seed account with a real admin account
- [ ] Set up SSL (nginx/Caddy in front of the Node server)
- [ ] Configure regular SQLite backups
