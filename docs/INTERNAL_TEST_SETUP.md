# Internal Test Setup

*Last updated: 2026-04-19*

---

## Prerequisites

- Node.js v18+
- npm v9+
- Expo CLI (for mobile): `npm install -g expo-cli`

---

## Quick Start

```bash
# 1. Clone / open the project
cd c:/Projects/UnforgettableRides

# 2. Install all dependencies
cd rides-api    && npm install && cd ..
cd rides-admin  && npm install && cd ..
cd rides-portal && npm install && cd ..
cd rides-app    && npm install && cd ..

# 3. Start everything
start_all.bat
```

Services will start at:
- API: http://localhost:3000
- Admin: http://localhost:5173
- Portal: http://localhost:5174
- Mobile (web): http://localhost:8081

---

## Seeded Test Accounts

On first run the API seeds:

| Email | Password | Role |
|---|---|---|
| `admin@unforgettablerides.com` | `admin123` | admin |

To add test owner/customer accounts, register via the portal at http://localhost:5174/register.

---

## Sample Data

12 classic cars are seeded automatically on first API start (if `classic_cars` table is empty). Cars use Unsplash placeholder images.

To re-seed: delete all rows from `classic_cars` and `car_images`, then restart the API.

---

## Verifying the API

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Featured cars (public)
curl http://localhost:3000/api/v1/cars/featured

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@unforgettablerides.com","password":"admin123"}'
```

---

## Portal TypeScript Check

```bash
cd rides-portal && npx tsc --noEmit
```

Should produce zero errors.

## Portal Production Build

```bash
cd rides-portal && npm run build
```

Output in `rides-portal/dist/`.

