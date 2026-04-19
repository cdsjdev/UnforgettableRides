function registerBookingsRoutes({
  app,
  apiResponse,
  roleGuard,
  db,
  uuidv4,
  sendEmailNotification,
  getSetting,
}) {
  // ── Helpers ──────────────────────────────────────���────────────

  function formatBookingDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(String(dateStr).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (_) {
      return String(dateStr);
    }
  }

  async function sendBookingEmail(type, booking, carInfo, customerEmail) {
    if (!customerEmail) return;
    const carLabel = carInfo
      ? `${carInfo.year} ${carInfo.make} ${carInfo.model}`
      : 'your booked vehicle';
    const dateLabel = formatBookingDate(booking.event_date);

    const subjectMap = {
      created: `Booking Confirmed — ${carLabel} on ${dateLabel}`,
      confirmed: `Your UnforgettableRides booking is confirmed — ${carLabel}`,
      cancelled: `Booking Cancelled — ${carLabel} on ${dateLabel}`,
    };

    const bodyMap = {
      created: `Your booking request for the ${carLabel} on ${dateLabel} has been received. The owner will confirm shortly.`,
      confirmed: `Great news! Your booking for the ${carLabel} on ${dateLabel} has been confirmed by the owner.`,
      cancelled: `Your booking for the ${carLabel} on ${dateLabel} has been cancelled.`,
    };

    const subject = subjectMap[type] || `UnforgettableRides booking update`;
    const message = bodyMap[type] || `Your booking status has changed to: ${type}`;

    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827">
  <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0">
    <h1 style="color:#e8c04a;margin:0;font-size:20px">UnforgettableRides</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:16px">${message}</p>
    <p style="color:#6B7280;font-size:13px">Booking reference: #${booking.id}</p>
    <p style="color:#6B7280;font-size:13px">Event type: ${booking.event_type || 'N/A'}</p>
    <p style="color:#6B7280;font-size:13px">Thank you for choosing UnforgettableRides!</p>
  </div>
</div>`.trim();

    await sendEmailNotification({
      kind: `booking_${type}`,
      to: customerEmail,
      payload: { subject, message, html },
    }).catch(() => {});
  }

  // ── POST /api/v1/bookings ─────────────────────────────────────
  app.post('/api/v1/bookings', (req, res) => {
    try {
      const carId = String(req.body?.car_id || '').trim();
      const eventType = String(req.body?.event_type || '').trim();
      const eventDate = String(req.body?.event_date || '').trim();

      if (!carId || !eventType || !eventDate) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: 'car_id, event_type, and event_date are required',
        }));
      }

      const car = db.prepare(
        'SELECT * FROM classic_cars WHERE id = ? AND is_active = 1 AND available_for_hire = 1'
      ).get(carId);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found or unavailable' }));
      }

      // Check if event_date is blocked
      const blocked = db.prepare(
        "SELECT id FROM car_availability WHERE car_id = ? AND blocked_date = ?"
      ).get(carId, eventDate.slice(0, 10));
      if (blocked) {
        return res.status(409).json(apiResponse(null, {
          code: 'DATE_BLOCKED',
          message: 'The selected date is not available for this car',
        }));
      }

      // Calculate total price
      const durationHours = req.body?.duration_hours != null ? Number(req.body.duration_hours) : null;
      const durationDays = req.body?.duration_days != null ? parseInt(req.body.duration_days, 10) : null;

      let totalPriceCents = null;
      let priceBreakdown = null;

      if (Number.isFinite(durationDays) && durationDays > 0 && car.price_per_day_cents) {
        totalPriceCents = car.price_per_day_cents * durationDays;
        priceBreakdown = JSON.stringify({
          rate_per_day_cents: car.price_per_day_cents,
          days: durationDays,
          total_cents: totalPriceCents,
        });
      } else if (Number.isFinite(durationHours) && durationHours > 0 && car.price_per_hour_cents) {
        totalPriceCents = Math.round(car.price_per_hour_cents * durationHours);
        priceBreakdown = JSON.stringify({
          rate_per_hour_cents: car.price_per_hour_cents,
          hours: durationHours,
          total_cents: totalPriceCents,
        });
      }

      const bookingId = uuidv4();
      db.prepare(`
        INSERT INTO bookings
        (id, car_id, customer_id, event_type, event_date, duration_hours, duration_days,
         pickup_location, notes, status, total_price_cents, price_breakdown,
         stripe_payment_intent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, datetime('now'), datetime('now'))
      `).run(
        bookingId,
        carId,
        req.user.id,
        eventType,
        eventDate,
        Number.isFinite(durationHours) ? durationHours : null,
        Number.isFinite(durationDays) ? durationDays : null,
        String(req.body?.pickup_location || '').trim() || null,
        String(req.body?.notes || '').trim() || null,
        totalPriceCents,
        priceBreakdown
      );

      const created = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);

      // Send email to customer
      const customerUser = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
      if (customerUser?.email) {
        sendBookingEmail('created', created, car, customerUser.email).catch(() => {});
      }

      return res.status(201).json(apiResponse(created));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── GET /api/v1/bookings ──────────────────────────────────────
  app.get('/api/v1/bookings', (req, res) => {
    try {
      const status = String(req.query.status || '').trim();
      const params = [];
      let sql;

      if (req.user.role === 'admin') {
        sql = 'SELECT b.*, c.make, c.model, c.year FROM bookings b LEFT JOIN classic_cars c ON c.id = b.car_id WHERE 1=1';
      } else if (req.user.role === 'owner') {
        // Owners can act as both: car owner and customer on the same account.
        sql = `
          SELECT b.*, c.make, c.model, c.year
          FROM bookings b
          JOIN classic_cars c ON c.id = b.car_id
          WHERE c.owner_id = ? OR b.customer_id = ?
        `;
        params.push(req.user.id, req.user.id);
      } else {
        // Customers see their own bookings
        sql = `
          SELECT b.*, c.make, c.model, c.year
          FROM bookings b
          LEFT JOIN classic_cars c ON c.id = b.car_id
          WHERE b.customer_id = ?
        `;
        params.push(req.user.id);
      }

      if (status) {
        sql += ' AND b.status = ?';
        params.push(status);
      }

      sql += ' ORDER BY b.created_at DESC';
      const rows = db.prepare(sql).all(...params);
      return res.json(apiResponse(rows));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── GET /api/v1/bookings/:id ──────────────────────────────────
  app.get('/api/v1/bookings/:id', (req, res) => {
    try {
      const booking = db.prepare(`
        SELECT b.*, c.make, c.model, c.year, c.owner_id
        FROM bookings b
        LEFT JOIN classic_cars c ON c.id = b.car_id
        WHERE b.id = ?
      `).get(req.params.id);

      if (!booking) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Booking not found' }));
      }

      const isAdmin = req.user.role === 'admin';
      const isCustomer = booking.customer_id === req.user.id;
      const isCarOwner = booking.owner_id === req.user.id;

      if (!isAdmin && !isCustomer && !isCarOwner) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      return res.json(apiResponse(booking));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── PATCH /api/v1/bookings/:id/status ────────────────────────
  app.patch('/api/v1/bookings/:id/status', (req, res) => {
    try {
      const booking = db.prepare(`
        SELECT b.*, c.make, c.model, c.year, c.owner_id
        FROM bookings b
        LEFT JOIN classic_cars c ON c.id = b.car_id
        WHERE b.id = ?
      `).get(req.params.id);

      if (!booking) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Booking not found' }));
      }

      const newStatus = String(req.body?.status || '').trim();
      if (!newStatus) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'status is required' }));
      }

      const isAdmin = req.user.role === 'admin';
      const isCustomer = booking.customer_id === req.user.id;
      const isCarOwner = booking.owner_id === req.user.id;

      if (!isAdmin && !isCustomer && !isCarOwner) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      // Validate allowed transitions
      if (!isAdmin) {
        const currentStatus = booking.status;
        if (isCarOwner && !['confirmed', 'cancelled', 'completed'].includes(newStatus)) {
          return res.status(400).json(apiResponse(null, {
            code: 'INVALID_TRANSITION',
            message: 'Owner can set status to: confirmed, cancelled, completed',
          }));
        }
        if (isCarOwner && currentStatus !== 'pending' && newStatus !== 'completed') {
          return res.status(400).json(apiResponse(null, {
            code: 'INVALID_TRANSITION',
            message: `Cannot transition booking from '${currentStatus}' to '${newStatus}'`,
          }));
        }
        if (isCustomer && !isCarOwner) {
          if (newStatus !== 'cancelled') {
            return res.status(400).json(apiResponse(null, {
              code: 'INVALID_TRANSITION',
              message: 'Customers can only cancel pending bookings',
            }));
          }
          if (currentStatus !== 'pending') {
            return res.status(400).json(apiResponse(null, {
              code: 'INVALID_TRANSITION',
              message: 'Can only cancel pending bookings',
            }));
          }
        }
      }

      db.prepare(`
        UPDATE bookings
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, booking.id);

      const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);

      // Send email notification
      if (['confirmed', 'cancelled'].includes(newStatus)) {
        const customerUser = db.prepare('SELECT email FROM users WHERE id = ?').get(booking.customer_id);
        if (customerUser?.email) {
          sendBookingEmail(newStatus, updated, booking, customerUser.email).catch(() => {});
        }
      }

      return res.json(apiResponse(updated));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });
}

module.exports = { registerBookingsRoutes };
