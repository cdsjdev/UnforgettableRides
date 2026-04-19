# UI Screen Specifications

*Last updated: 2026-04-19*

---

## Portal (`rides-portal`) — React + Vite

### Design System

| Token | Value |
|---|---|
| `--bg` | `#0d0d0d` — page background |
| `--bg-surface` | `#141414` — elevated surface |
| `--bg-card` | `#1a1a1a` — card background |
| `--gold` | `#c9a84c` — primary accent |
| `--gold-bright` | `#e8c96a` — hover / highlight |
| `--gold-dim` | `rgba(201,168,76,0.12)` — subtle fill |
| `--text` | `#f0ebe0` — primary text |
| `--text-muted` | `#a09070` — secondary text |
| `--border` | `rgba(255,255,255,0.08)` — default border |
| `--gold-border` | `rgba(201,168,76,0.25)` — accent border |

Typography: `Georgia, Palatino Linotype, serif` for headings. System sans-serif for body.

---

### Pages & Routes

| Route | Page | Status |
|---|---|---|
| `/` | `HomePage` | ✅ Done |
| `/cars` | `CarsPage` | ✅ Done |
| `/cars/:id` | `CarDetailPage` | ✅ Done |
| `/book/:carId` | `BookingPage` | ✅ Done |
| `/bookings` | `BookingsPage` | ✅ Done |
| `/messages` | `MessagesPage` | ✅ Done |
| `/messages/:threadId` | `MessageThreadPage` | ✅ Done |
| `/how-it-works` | `HowItWorksPage` | ✅ Done |
| `/about` | `AboutPage` | ✅ Done |
| `/login` | `LoginPage` | ✅ Done |
| `/register` | `RegisterPage` | ✅ Done |
| `/owner` | `OwnerDashboardPage` | ✅ Done |
| `/owner/cars/new` | `AddCarPage` | ✅ Done |
| `/owner/cars/:id/edit` | `EditCarPage` | ✅ Done |

---

### Key Components

**NavBar** — transparent on hero (`/`), solid dark on scroll or other pages. Links adapt to auth state:
- Unauthenticated: Browse Cars / How It Works / About / Sign In / Register
- Customer: Browse Cars / My Bookings / Messages / (avatar menu)
- Owner: Browse Cars / My Listings / Messages / (avatar menu)
- Admin: all of the above

**CarCard** — primary image, gold tag badges, year/make/model, location, from price, "View Details" link.

**BookingSidebar** — sticky right column on CarDetailPage and BookingPage. Shows price breakdown, availability, CTA buttons.

**OwnerDashboard** — tabbed (My Cars / Bookings / Quotes), stats row, inline Accept/Decline actions.

---

## Mobile App (`rides-app`) — React Native + Expo 54

### Navigation (Phase 4 — planned)

4-tab bottom navigator:

| Tab | Icon | Screen |
|---|---|---|
| Home | home-outline | Featured cars, hero banner |
| Cars | car-sport-outline | Browse + filter |
| Messages | chatbubbles-outline | DM thread list (unread badge) |
| Profile | person-circle-outline | Auth, bookings, owner listings |

---

## Admin Dashboard (`rides-admin`) — React + Vite

### Sidebar Navigation (Phase 3 — planned)

- Dashboard (overview stats)
- Bookings
- Transactions
- Car Listings
- Users
- Analytics
- Moderation
- Payouts
