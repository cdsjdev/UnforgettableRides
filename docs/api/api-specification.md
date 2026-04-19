# UnforgettableRides API Specification

*Last updated: 2026-04-19 · Base URL: `http://localhost:3000/api/v1`*

---

## Authentication

All endpoints except those listed as **Public** require a `Bearer` token in the `Authorization` header.

```
Authorization: Bearer <jwt_token>
```

Tokens are obtained via `POST /auth/login` or `POST /auth/signup`.

### Roles

| Role | Description |
|---|---|
| `admin` | Full access to all endpoints |
| `owner` | Manage own car listings, respond to bookings and quotes |
| `customer` | Browse, book, quote, message |

---

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | Public | Register (pass `role: "owner"` to register as owner) |
| POST | `/auth/login` | Public | Login — returns `{ token, user }` |
| GET | `/auth/me` | Required | Get current user profile |
| POST | `/auth/password/forgot` | Public | Send password reset email |
| POST | `/auth/password/reset` | Public | Reset password with token |

---

## Cars

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/cars` | Public | Browse cars. Query: `tag`, `make`, `year_min`, `year_max`, `location`, `limit`, `offset` |
| GET | `/cars/featured` | Public | 6 highest-rated available cars |
| GET | `/cars/:id` | Public | Car detail with images, owner info, reviews |
| POST | `/cars` | owner/admin | Create a listing |
| PUT | `/cars/:id` | owner/admin | Update a listing |
| DELETE | `/cars/:id` | owner/admin | Soft-delete a listing |
| POST | `/cars/:id/images` | owner/admin | Upload an image (multipart/form-data, field: `image`) |
| DELETE | `/cars/:id/images/:imageId` | owner/admin | Delete an image |
| GET | `/cars/:id/availability` | Public | List blocked dates for a car |
| POST | `/cars/:id/availability` | owner/admin | Block a date |
| DELETE | `/cars/:carId/availability/:id` | owner/admin | Unblock a date |
| POST | `/cars/:id/reviews` | customer | Submit a review (requires completed booking) |

### Car object

```jsonc
{
  "id": "uuid",
  "owner_id": "uuid",
  "make": "Rolls-Royce",
  "model": "Silver Shadow",
  "year": 1972,
  "color": "Midnight Black",
  "description": "...",
  "tags": ["wedding", "event"],           // "wedding"|"photoshoot"|"event"|"other"
  "price_per_day_cents": 95000,           // $950.00
  "price_per_hour_cents": 15000,
  "location": "London, UK",
  "available_for_hire": true,
  "is_active": true,
  "images": [{ "id": "...", "url": "...", "is_primary": true, "sort_order": 0 }],
  "average_rating": 4.8,
  "review_count": 12,
  "created_at": "...",
  "updated_at": "..."
}
```

---

## Bookings

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/bookings` | customer | Create a booking request |
| GET | `/bookings` | Required | List own bookings (customers see theirs; owners see bookings for their cars) |
| GET | `/bookings/:id` | Required | Booking detail |
| PATCH | `/bookings/:id/status` | owner/admin | Update status: `confirmed`, `completed`, `cancelled` |

### Booking object

```jsonc
{
  "id": "uuid",
  "car_id": "uuid",
  "customer_id": "uuid",
  "event_type": "wedding",               // "wedding"|"photoshoot"|"event"|"other"
  "event_date": "2026-06-14",
  "duration_days": 1,                    // or duration_hours
  "duration_hours": null,
  "pickup_location": "The Grand Hotel, London",
  "notes": "Please arrive 30 mins early",
  "status": "pending",                   // pending|confirmed|completed|cancelled
  "total_price_cents": 95000,
  "created_at": "...",
  "updated_at": "..."
}
```

---

## Quotes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/quotes` | customer | Submit a quote request |
| GET | `/quotes` | Required | List own quotes |
| PATCH | `/quotes/:id/status` | owner/admin | Update status: `accepted`, `declined`, `expired` |

### Quote object

```jsonc
{
  "id": "uuid",
  "car_id": "uuid",
  "customer_id": "uuid",
  "message": "We'd love to hire the Bentley for our June wedding...",
  "proposed_price_cents": 85000,         // optional — customer's suggested price
  "event_type": "wedding",
  "event_date": "2026-06-14",
  "status": "pending",                   // pending|accepted|declined|expired
  "created_at": "..."
}
```

---

## Messaging (Social Threads)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/social/threads` | Required | List DM threads for current user |
| POST | `/social/threads` | Required | Start a new thread (body: `{ recipient_id }`) |
| GET | `/social/threads/:threadId/messages` | Required | List messages in a thread |
| POST | `/social/threads/:threadId/messages` | Required | Send a message (body: `{ body }`) |
| POST | `/social/threads/:threadId/read` | Required | Mark thread as read |

---

## Payouts (Admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/payouts` | admin | List all payouts |
| POST | `/payouts` | admin | Create a payout record |
| PATCH | `/payouts/:id/status` | admin | Update status: `processing`, `paid`, `failed` |

---

## Payments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/payments/config` | Public | Stripe publishable key + currency |
| POST | `/payments/intent` | Required | Create a Stripe payment intent for a booking |
| POST | `/payments/webhook` | Public (Stripe sig) | Stripe webhook handler |

---

## Analytics (Admin)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/analytics/summary` | admin | Booking counts, revenue totals, top cars |

---

## Response envelope

All responses use this shape:

```jsonc
{
  "success": true,
  "data": { ... },           // null on error
  "error": null,             // { "code": "...", "message": "..." } on failure
  "meta": {
    "timestamp": "2026-04-19T...",
    "request_id": "uuid"
  }
}
```

### Common error codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Authenticated but insufficient role |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate (e.g. email already registered) |
| `INVALID_REQUEST` | 400 | Missing or invalid request body |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal error |
