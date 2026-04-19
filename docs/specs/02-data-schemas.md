# Data Schemas

*Last updated: 2026-04-19 · Source of truth: `rides-api/migrations/0019_rides_up.sql`*

---

## classic_cars

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| owner_id | TEXT FK→users | |
| make | TEXT | e.g. "Rolls-Royce" |
| model | TEXT | e.g. "Silver Shadow" |
| year | INTEGER | |
| color | TEXT | |
| description | TEXT | nullable |
| tags | TEXT | JSON array: `["wedding","photoshoot","event","other"]` |
| price_per_hour_cents | INTEGER | nullable |
| price_per_day_cents | INTEGER | nullable |
| location | TEXT | nullable |
| latitude / longitude | REAL | nullable |
| available_for_hire | INTEGER | 0 or 1 (boolean) |
| is_active | INTEGER | 0 or 1; soft-delete flag |
| created_at / updated_at | TEXT | ISO datetime |

## car_images

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| car_id | TEXT FK→classic_cars | CASCADE delete |
| url | TEXT | Relative `/uploads/...` or absolute URL |
| is_primary | INTEGER | 0 or 1 |
| sort_order | INTEGER | Display order |

## car_availability

Blocked dates for a car (owner cannot accept bookings on these dates).

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| car_id | TEXT FK | CASCADE delete |
| blocked_date | TEXT | ISO date: `YYYY-MM-DD` |
| reason | TEXT | nullable |

## bookings

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| car_id | TEXT FK→classic_cars | |
| customer_id | TEXT FK→users | |
| event_type | TEXT | `wedding|photoshoot|event|other` |
| event_date | TEXT | ISO date |
| duration_hours | REAL | nullable |
| duration_days | INTEGER | nullable |
| pickup_location | TEXT | nullable |
| notes | TEXT | nullable |
| status | TEXT | `pending|confirmed|completed|cancelled` |
| total_price_cents | INTEGER | nullable |
| price_breakdown | TEXT | JSON, nullable |
| stripe_payment_intent_id | TEXT | nullable |

## quotes

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| car_id | TEXT FK | |
| customer_id | TEXT FK | |
| message | TEXT | Customer's enquiry |
| proposed_price_cents | INTEGER | nullable |
| event_type | TEXT | nullable |
| event_date | TEXT | nullable |
| status | TEXT | `pending|accepted|declined|expired` |

## reviews

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| car_id | TEXT FK | |
| booking_id | TEXT FK→bookings | nullable |
| reviewer_id | TEXT FK→users | |
| rating | INTEGER | 1–5 (CHECK constraint) |
| text | TEXT | nullable |
| photo_urls | TEXT | JSON array |
| is_active | INTEGER | soft-delete |

## payouts

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| owner_id | TEXT FK→users | |
| amount_cents | INTEGER | |
| currency | TEXT | Default `USD` |
| period_start / period_end | TEXT | nullable ISO dates |
| status | TEXT | `pending|processing|paid|failed` |
| stripe_transfer_id | TEXT | nullable |
| notes | TEXT | nullable |

---

## Preserved social tables (for owner-customer DMs)

- `social_threads` — conversation thread between two users
- `social_thread_members` — users in a thread
- `social_messages` — individual messages
- `social_users` — per-user social settings (privacy, messaging enabled)
- `social_abuse_events` — rate limiting for messaging
