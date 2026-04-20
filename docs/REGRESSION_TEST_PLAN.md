# UnforgettableRides Regression Test Plan

This plan defines a complete, repeatable regression strategy for the monorepo:

- `rides-api` (backend/API)
- `rides-admin` (admin web)
- `rides-app` (customer app web runtime)
- `rides-portal` (classic car portal web)

## 1) Regression Objectives

- Catch functional breakage on critical user journeys before deploy.
- Verify cross-surface contracts: auth/session, booking lifecycle, messaging, payments-related API behavior.
- Keep runtime stable on desktop and phone-sized browsers.

## 2) Test Layers

1. Unit/API integration (`rides-api` Jest + Supertest)
2. Web end-to-end (`rides-admin` Playwright)
3. App web end-to-end (`rides-app` Playwright on Expo web)
4. Portal end-to-end (`rides-portal` Playwright)
5. Static guards (encoding/navigation checks in `rides-app`)

## 3) Coverage Matrix

1. Authentication and account state:
- Signup/login/logout
- Forgot password entry points
- Session persistence and protected-route behavior

2. Marketplace and booking:
- Browse listings
- Car detail navigation
- Booking request creation
- Booking visibility/status for the requester

3. Owner workflows:
- Owner access enablement
- Owner dashboard route access and tabs
- Listing/bookings/quotes visibility

4. Messaging and social surfaces (existing suites):
- Thread list/message send/read behaviors
- Moderation and abuse-related regressions

5. Admin operations:
- Auth and navigation
- Analytics/store scope/pricing/RBAC/ops flows

6. API reliability:
- Auth and email security
- Guest/public routes
- Payments flows and fallbacks
- Appointments and social route regressions

## 4) Execution Modes

1. Smoke (pre-merge/default): run all existing regression stages once on Chromium.
2. Full matrix (release gate): include multi-browser admin E2E and optional mobile matrix.
3. Focused reruns: run changed-surface suites first (API-only, portal-only, etc.).

## 5) Standard Command

From repo root:

```powershell
./scripts/run_regression.ps1
```

Full matrix:

```powershell
./scripts/run_regression.ps1 -Full -Mobile
```

This orchestration now includes:

- API tests + targeted API regressions
- Admin E2E install + tests
- Portal E2E install + tests
- App web E2E + app guard checks

## 6) Portal Regression Scope (new)

Implemented in `rides-portal/e2e/tests/portal-regression.spec.ts`:

1. Mobile navbar reachability:
- `Browse Cars`, `How It Works`, and `About` are reachable/clickable at phone viewport.

2. Critical functional path:
- Register -> verify-email screen -> home
- Browse cars -> car detail -> booking request -> bookings list
- Enable owner dashboard -> owner landing visibility

## 7) CI Recommendation

1. PR pipeline:
- Run `scripts/run_regression.ps1` (smoke)

2. Release pipeline:
- Run `scripts/run_regression.ps1 -Full -Mobile`
- Publish Playwright HTML reports as artifacts for admin/app/portal failures

## 8) Pass/Fail Rules

- Any failed stage is a regression failure.
- Fixes must include either:
  - test update proving intended behavior change, or
  - bugfix preserving existing test expectations.

