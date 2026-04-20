# UnforgettableRides

UnforgettableRides is a ride-booking platform with:
- Mobile app (`rides-app`)
- Admin web dashboard (`rides-admin`)
- Customer portal (`rides-portal`)
- API service (`rides-api`)
- ML service (`ml-models`)

This README is the canonical project entrypoint.

## Repository Layout

- `rides-app/` React Native + Expo customer app
- `rides-admin/` React + Vite admin dashboard
- `rides-portal/` Customer-facing web portal
- `rides-api/` Node.js + Express API
- `ml-models/` FastAPI ML services (breed + detection)
- `shared/` shared TypeScript types
- `docs/` operational, API, and product specs
- `scripts/` deployment and operations scripts

## Quick Start (Local)

1. Install dependencies for each service.
2. Start backend services (`rides-api`, `ml-models`).
3. Start `rides-admin`.
4. Start `rides-portal`.
5. Start `rides-app` with Expo.

Project helper scripts (Windows) are available in the repo root:
- `setup.bat`
- `start_all.bat`
- `start_backends.bat`
- `stop_all.bat`

## Ports (Typical)

- API: `3000`
- ML service: `8001`
- Admin dashboard (dev): `5173`
- Portal (dev): `5174`
- Expo app (dev): `8081`
- Admin (docker/prod): `8080`
- Portal (docker/prod): `8082` by default (override with `PORTAL_PORT`)
- App web (docker/prod): `8081`

## Documentation Quick Links

- Deployment and AWS rebuild runbook:
  - `docs/AWS_REBUILD_AND_OPERATIONS_PLAYBOOK.md`
- Admin dashboard operations:
  - `docs/ADMIN_DASHBOARD_HELP.md`
- Internal testing setup:
  - `docs/INTERNAL_TEST_SETUP.md`
- DB account maintenance:
  - `docs/DB_ACCOUNT_MAINTENANCE.md`
- User guide:
  - `docs/USER_GUIDE.md`
- API specification:
  - `docs/api/api-specification.md`
- Data schemas:
  - `docs/specs/02-data-schemas.md`
- ML behavior notes:
  - `docs/specs/03-ml-model-specifications.md`
- UI screen spec:
  - `docs/ui/01-screen-specifications.md`

## Vision Analytics Notes

Vision Analytics supports camera-based counting with tracked and legacy metrics.

Key admin area:
- `Vision Analytics -> Camera Setup & Preview`

Door line tracking supports:
- Tracking enable/disable
- Door line coordinates
- Entry direction
- Apply config without restart
- Test overlay for calibration

## Troubleshooting

- Camera not connected:
  - Verify camera URL and network reachability.
- No tracked metrics yet:
  - Start camera and run for enough time to collect data.
- Web UI not loading:
  - Confirm `rides-admin` is running and API base URL is correct.
- ML endpoints failing:
  - Confirm `ml-models` service is running and reachable by API.

## License

Internal project. All rights reserved.
