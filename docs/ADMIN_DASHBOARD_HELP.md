# Admin Dashboard Help

*Last updated: 2026-04-19*

The admin dashboard (`rides-admin`) is a React + Vite web app running separately from the public portal.

---

## Roles

| Role | Access |
|---|---|
| `admin` | Full access to all dashboard sections |
| `owner` | Portal only — owner dashboard, car listings, bookings, quotes |
| `customer` | Portal only — browse, book, message |

Admin accounts are created via `POST /api/v1/auth/register` (requires an existing admin token) or by directly seeding the database.

---

## Dashboard Sections (Phase 3 — in progress)

The following pages are planned for the admin dashboard:

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | Stats: active listings, today's bookings, pending quotes, revenue |
| Bookings | `/bookings` | All bookings, filter by status, confirm/cancel on behalf of owner |
| Transactions | `/transactions` | Booking payments, Stripe payment intents |
| Car Listings | `/listings` | Browse all cars, toggle availability, soft-delete |
| Users | `/users` | Manage user accounts, roles, active/inactive status |
| Analytics | `/analytics` | Booking volume, revenue by month, top cars, event type breakdown |
| Moderation | `/moderation` | Review moderation, listing moderation |
| Payouts | `/payouts` | Payout tracking per owner, initiate payout |

> **Note:** Phase 3 (admin dashboard transformation) has not yet been implemented. The current admin app still contains petcare-era pages. See `docs/PLAN.md` for status.

---

## Starting the Admin App

```bash
cd rides-admin
npm install
npm run dev        # runs on http://localhost:5173
```

Default admin credentials (seeded on first run):

| Field | Value |
|---|---|
| Email | `admin@petcare.com` |
| Password | `admin123` |

> Change these immediately in any non-development environment.

---

## API Base URL

The admin app calls `http://localhost:3000/api/v1` by default. This is configured in `rides-admin/src/services/api.ts`.
