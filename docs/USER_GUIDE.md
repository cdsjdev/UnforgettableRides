# UnforgettableRides — User Guide

*Last updated: 2026-04-19*

---

## What is UnforgettableRides?

UnforgettableRides is a marketplace connecting classic car enthusiasts with people who want a memorable arrival at weddings, photo shoots, and special events. Every car is **owner-driven** — the person behind the wheel is the one who owns and loves the vehicle.

---

## For Customers

### Browsing Cars

1. Visit the **Browse Cars** page (`/cars`)
2. Filter by event type (Wedding / Photo Shoot / Special Event), make, or year range
3. Click any car card to open its detail page

### Car Detail Page

- Photo gallery with thumbnail strip — click to zoom
- Full description and car history
- Pricing (per day and/or per hour)
- Owner card with rating and "Message Owner" button
- Customer reviews
- Booking sidebar (right column):
  - **Request Booking** — redirects to the full booking form
  - **Request a Quote** — sends a custom price enquiry directly from the page

### Requesting a Booking

1. On a car detail page, click **Request Booking** (or go to `/book/:carId`)
2. Select your event type, date, and duration
3. Add your pickup location and any notes for the owner
4. Submit — no payment is taken until the owner confirms
5. Track your booking at **My Bookings** (`/bookings`)

### Booking Statuses

| Status | Meaning |
|---|---|
| **Pending** | Waiting for the owner to accept |
| **Confirmed** | Owner has accepted — your event is locked in |
| **Completed** | Event has taken place |
| **Cancelled** | Booking was declined or cancelled |

### Messaging an Owner

- From any car detail page, click **Message Owner**
- View all conversations at **Messages** (`/messages`)
- Select a thread to open the full chat view
- Press **Enter** to send (Shift+Enter for a new line)

### Requesting a Quote

Use the quote form on a car detail page if you want a custom price. The owner will receive your message and can respond with a proposed rate.

---

## For Car Owners

### Registering as an Owner

When signing up at `/register`, select **Car Owner** (or visit `/register?role=owner`). This gives you access to the Owner Dashboard.

### Owner Dashboard (`/owner`)

Your dashboard shows:

- **Stats row** — active listings, pending bookings, pending quotes, total earnings
- **My Cars tab** — all your listings with availability toggle and edit/view buttons
- **Bookings tab** — incoming booking requests with Accept/Decline actions
- **Quotes tab** — incoming quote enquiries with Accept/Decline actions

### Listing a Car (`/owner/cars/new`)

Fill in:

- Make, model, year, colour
- Location (city/region)
- Description — tell customers about the car's history and condition
- Event types the car is suitable for (tick all that apply)
- Pricing per day and/or per hour (optional — leave blank to quote per enquiry)
- Up to 8 photos (first photo becomes the primary listing image)

Listings are reviewed by the admin team before going live.

### Editing a Listing (`/owner/cars/:id/edit`)

All fields are editable at any time. You can also add or remove photos from this page.

### Managing Availability

Toggle a car between **Available** and **Unavailable** directly from the dashboard car row. When unavailable, the car will not appear in search results.

### Accepting Bookings

When a customer submits a booking request you will see it under the **Bookings** tab with a **Pending** badge. Review the event details and click **Confirm** or **Decline**. The customer is notified either way.

### Getting Paid

Payouts are processed after a booking is marked completed. The admin team handles payout scheduling — contact support if you have questions about a specific payment.

---

## Account & Security

### Signing In

Visit `/login`. Enter your email and password. If your account has two-step verification enabled you will receive a one-time code by email.

### Changing Your Password

Use the **Forgot Password** link on the login page. A reset link will be emailed to you.

### Email Verification

After signing up you will receive a verification email. Some features (such as messaging) require a verified email address.

---

## Frequently Asked Questions

**Is the car owner present at the event?**
Yes — all hires are owner-driven. The owner brings and drives their own car.

**How far ahead should I book?**
For weddings we recommend at least 4–8 weeks in advance. Popular cars fill up months ahead.

**What if I need to cancel?**
Cancellation terms are set by each owner and shown on the listing. Most owners allow free cancellation up to 14 days before the event.

**Are the cars insured?**
Each owner is responsible for their own insurance. Confirm coverage directly with the owner before finalising your booking.

**How do I list my car?**
Register with the Owner role, then visit your dashboard and click **Add New Car**.
