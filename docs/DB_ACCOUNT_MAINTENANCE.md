# Database & Account Maintenance

*Last updated: 2026-04-19*

All commands use the SQLite CLI: `sqlite3 rides-api/src/data/analytics.db`

---

## Common Queries

### List all users

```sql
SELECT id, email, name, role, is_active, created_at FROM users ORDER BY created_at DESC;
```

### Promote a user to admin

```sql
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

### Deactivate a user

```sql
UPDATE users SET is_active = 0 WHERE email = 'user@example.com';
```

### List all car listings

```sql
SELECT id, make, model, year, owner_id, available_for_hire, is_active FROM classic_cars ORDER BY created_at DESC;
```

### Soft-delete a listing

```sql
UPDATE classic_cars SET is_active = 0, updated_at = datetime('now') WHERE id = 'car-uuid';
```

### View all pending bookings

```sql
SELECT b.id, b.event_date, b.event_type, b.status, c.make, c.model, u.email
FROM bookings b
JOIN classic_cars c ON c.id = b.car_id
JOIN users u ON u.id = b.customer_id
WHERE b.status = 'pending'
ORDER BY b.event_date ASC;
```

### Cancel a booking

```sql
UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = 'booking-uuid';
```

### View pending payouts

```sql
SELECT p.id, p.amount_cents, p.status, u.email, u.name
FROM payouts p
JOIN users u ON u.id = p.owner_id
WHERE p.status = 'pending'
ORDER BY p.created_at DESC;
```

---

## Migrations

Migrations are in `rides-api/migrations/`. They run automatically on server start.

To manually apply a migration:
```bash
sqlite3 rides-api/src/data/analytics.db < rides-api/migrations/0019_rides_up.sql
```

To roll back:
```bash
sqlite3 rides-api/src/data/analytics.db < rides-api/migrations/0019_rides_down.sql
# Then remove the migration record so it re-runs next start:
sqlite3 rides-api/src/data/analytics.db "DELETE FROM schema_migrations WHERE filename = '0019_rides_up.sql';"
```

---

## Backup & Restore

```bash
# Backup
sqlite3 rides-api/src/data/analytics.db ".backup rides-api/backup-$(date +%Y%m%d).db"

# Restore
cp rides-api/backup-20260419.db rides-api/src/data/analytics.db
```

---

## Resetting Sample Data

To wipe and re-seed all sample cars (useful in development):

```sql
DELETE FROM car_images WHERE car_id IN (SELECT id FROM classic_cars);
DELETE FROM classic_cars;
```

Then restart the API — the sample cars from `src/data/sample-cars.json` will be re-seeded automatically.
