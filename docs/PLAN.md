# UnforgettableRides — Implementation Plan & Progress Tracker

> **Last updated:** 2026-04-19 — Phase 1 + Phase 2 + Phase 3 complete
> **Status legend:** ✅ Done · 🔄 In Progress · ⬜ Not Started

---

## Context

Transform the UnforgettableRides codebase into **UnforgettableRides** — a premium marketplace where classic car owners list their vehicles for hire at weddings, photo shoots, and special events. Customers browse, message owners, request quotes, and book. Admins manage listings, bookings, moderation, and payouts.

The existing codebase is reused as structural foundation (auth, payments, messaging, booking patterns, admin dashboard, portal). All dog/pet/wash/ML-vision code is removed. The public portal gets a full premium redesign: dark charcoal + gold, classic/heritage aesthetic.

---

## Directory Map

| Current | New | Status |
|---|---|---|
| `rides-api/` | `rides-api/` | ✅ Done |
| `rides-app/` | `rides-app/` | ✅ Done |
| `rides-admin/` | `rides-admin/` | ✅ Done |
| `rides-portal/` | `rides-portal/` | ✅ Done |
| `ml-models/` | *(deleted)* | ✅ Done |
| `shared/types.ts` | `shared/types.ts` | ✅ Done |

---

## Phase 0 — Git Detach + Renames ✅

| Task | Status |
|---|---|
| 0.1 Remove git remote (`git remote remove origin`) | ✅ Done |
| 0.2 Rename folders (`legacy-*` → `rides-*`, delete `ml-models`) | ✅ Done |
| 0.3 Update `"name"` in all `package.json` files | ✅ Done |
| 0.4 Update `rides-app/app.json` (slug, bundle ID, permissions) | ✅ Done |
| 0.5 Update `docker-compose.yml` / `docker-compose.production.yml` | ✅ Done |
| 0.6 Update `ecosystem.config.js` | ✅ Done |
| 0.7 Update `start_all.bat`, `start_backends.bat`, `start_portal.bat` | ✅ Done |

---

## Phase 1 — Backend Transformation (`rides-api`) ✅

| Task | Status |
|---|---|
| 1.1 DB migration `0019_rides_up.sql` — drop pet/ML tables, create cars/bookings/quotes/reviews/payouts | ✅ Done |
| 1.2 Delete `advisor.js` + `commerce.js`; messaging.js replaces social.js for DMs | ✅ Done |
| 1.3 Create `cars.js`, `bookings.js`, `quotes.js`, `payouts.js`, `messaging.js` route files | ✅ Done |
| 1.4 Update `index.js` — remove Square/PayPal/ML, register new routes, add 'owner' role, fix startup crashes | ✅ Done |
| 1.5 Update `shared/types.ts` — add 'owner' to UserRole | ✅ Done |
| 1.6 Create `sample-cars.json` — 12 classic cars with Unsplash images, seeded on first run | ✅ Done |

**Verified:** `GET /api/v1/cars/featured` returns 6 cars with full data including images, tags, pricing.

---

## Phase 2 — Portal Redesign (`rides-portal`) ✅

### Design Tokens
- Background: `#0d0d0d` / `#1a1a1a` / `#1f1f1f`
- Gold: `#c9a84c` (primary), `#d4af37` (hover)
- Text: `#f5f0e8` (primary), `#a09880` (muted)
- Typography: Georgia/Palatino serif for headings

| Task | Status |
|---|---|
| 2.1 Rewrite `index.css` — full dark/gold design system | ✅ Done |
| 2.2 Rewrite `App.tsx` — new routes, remove CartContext, new NavBar | ✅ Done |
| 2.3 Delete obsolete files (ProductsPage, CartPage, CartContext, i18n dir) | ✅ Done |
| 2.4 New page: `HomePage.tsx` (hero, featured cars, how-it-works teaser, testimonials, owner CTA) | ✅ Done |
| 2.5 New page: `CarsPage.tsx` (browse with tag/make/year filters, car cards) | ✅ Done |
| 2.6 New page: `CarDetailPage.tsx` (gallery, booking sidebar, owner card, reviews) | ✅ Done |
| 2.7 New page: `BookingPage.tsx` (event type/date/duration form → POST /api/v1/bookings) | ✅ Done |
| 2.8 New page: `BookingsPage.tsx` (customer's booking history, status badges) | ✅ Done |
| 2.9 New pages: `MessagesPage.tsx` + `MessageThreadPage.tsx` | ✅ Done |
| 2.10 New pages: `OwnerDashboardPage.tsx`, `AddCarPage.tsx`, `EditCarPage.tsx` | ✅ Done |
| 2.11 New pages: `HowItWorksPage.tsx`, `AboutPage.tsx` (static) | ✅ Done |
| 2.12 New page: `RegisterPage.tsx` (role selector, pre-selects owner via ?role=owner) | ✅ Done |
| 2.13 Rewrite `services/api.ts` — carsAPI, bookingsAPI, quotesAPI, messagingAPI | ✅ Done |
| 2.14 Fix `main.tsx` — remove CartProvider/I18nProvider | ✅ Done |
| 2.15 Fix `AuthContext.tsx` — add `role` param to register() | ✅ Done |

**Verified:** Portal builds clean (zero TypeScript errors, Vite production build succeeds).

---

## Phase 3 — Admin Dashboard (`rides-admin`) ✅

| Task | Status |
|---|---|
| 3.1 Delete 15 obsolete pages (DogsPage, StoresPage, RagDemoPage, AppointmentsPage, etc.) | ✅ Done |
| 3.2 Replace OverviewPage→DashboardPage, AnalyticsPage (booking-focused), rewrite UsersPage | ✅ Done |
| 3.3 Add `BookingsPage.tsx`, `CarListingsPage.tsx`, `TransactionsPage.tsx`, `PayoutsPage.tsx` | ✅ Done |
| 3.4 Rewrite `App.tsx` sidebar — Dashboard/Bookings/Transactions/Car Listings/Payouts/Users/Analytics/Moderation/Security, remove store switcher, brand = UnforgettableRides | ✅ Done |
| 3.5 Rewrite `services/api.ts` — remove all pet/store/membership APIs; add carsAdminAPI, bookingsAdminAPI, quotesAdminAPI, payoutsAdminAPI | ✅ Done |
| 3.6 Add domain types (ClassicCar, Booking, Quote, Payout, etc.) to `shared/types.ts` | ✅ Done |

**Verified:** Zero TypeScript errors; Vite production build succeeds (153 modules, 398 kB JS).

---

## Phase 4 — Mobile App (`rides-app`) ⬜

| Task | Status |
|---|---|
| 4.1 Delete ~25 obsolete screens (dog/wash/care/social-feed/meetup screens) | ⬜ |
| 4.2 Rename/repurpose: ProductList→CarList, ProductDetail→CarDetail, BookAppointment→Booking, etc. | ⬜ |
| 4.3 Rewrite `AppNavigator.tsx` — 4-tab structure (Home/Cars/Messages/Profile) | ⬜ |
| 4.4 Remove CartContext, CartScreen, CheckoutScreen, OrderHistoryScreen | ⬜ |
| 4.5 Update `services/api.ts` — remove pet methods, add rides methods | ⬜ |

---

## Verification Checklist

- [x] `cd rides-api && npm start` — server starts, migration 0019 runs, 12 sample cars seeded
- [x] `GET /api/v1/cars/featured` returns 200 with 6 cars + images
- [ ] `POST /api/v1/bookings` creates a booking record
- [x] `cd rides-portal && npm run build` — builds clean (0 TS errors)
- [ ] `cd rides-portal && npm run dev` — dark/gold portal visual check
- [ ] `/cars` — car grid renders with images
- [ ] `/cars/:id` — car detail with booking sidebar
- [x] `cd rides-admin && npm run build` — builds clean (0 TS errors, Vite build succeeds)
- [ ] `cd rides-admin && npm run dev` — admin dashboard, new sidebar nav visual check
- [ ] `cd rides-app && npx expo start --web` — 4-tab app loads
- [ ] No "UnforgettableRides", "dog", "wash", "breed" strings remain in any UI

