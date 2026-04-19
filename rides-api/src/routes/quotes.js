function registerQuotesRoutes({
  app,
  apiResponse,
  db,
  uuidv4,
}) {
  // ── POST /api/v1/quotes ───────────────────────────────────────
  app.post('/api/v1/quotes', (req, res) => {
    try {
      const carId = String(req.body?.car_id || '').trim();
      const message = String(req.body?.message || '').trim();

      if (!carId || !message) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: 'car_id and message are required',
        }));
      }

      const car = db.prepare(
        'SELECT id FROM classic_cars WHERE id = ? AND is_active = 1'
      ).get(carId);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }

      const id = uuidv4();
      db.prepare(`
        INSERT INTO quotes
        (id, car_id, customer_id, message, proposed_price_cents, event_type, event_date,
         status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).run(
        id,
        carId,
        req.user.id,
        message,
        req.body?.proposed_price_cents != null ? parseInt(req.body.proposed_price_cents, 10) : null,
        String(req.body?.event_type || '').trim() || null,
        String(req.body?.event_date || '').trim() || null
      );

      const created = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
      return res.status(201).json(apiResponse(created));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── GET /api/v1/quotes ────────────────────────────────────────
  app.get('/api/v1/quotes', (req, res) => {
    try {
      const params = [];
      let sql;

      if (req.user.role === 'admin') {
        sql = 'SELECT q.*, c.make, c.model, c.year FROM quotes q LEFT JOIN classic_cars c ON c.id = q.car_id WHERE 1=1';
      } else if (req.user.role === 'owner') {
        sql = `
          SELECT q.*, c.make, c.model, c.year
          FROM quotes q
          JOIN classic_cars c ON c.id = q.car_id
          WHERE c.owner_id = ?
        `;
        params.push(req.user.id);
      } else {
        sql = `
          SELECT q.*, c.make, c.model, c.year
          FROM quotes q
          LEFT JOIN classic_cars c ON c.id = q.car_id
          WHERE q.customer_id = ?
        `;
        params.push(req.user.id);
      }

      const status = String(req.query.status || '').trim();
      if (status) {
        sql += ' AND q.status = ?';
        params.push(status);
      }

      sql += ' ORDER BY q.created_at DESC';
      const rows = db.prepare(sql).all(...params);
      return res.json(apiResponse(rows));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── PATCH /api/v1/quotes/:id/status ──────────────────────────
  app.patch('/api/v1/quotes/:id/status', (req, res) => {
    try {
      const quote = db.prepare(`
        SELECT q.*, c.owner_id AS car_owner_id
        FROM quotes q
        LEFT JOIN classic_cars c ON c.id = q.car_id
        WHERE q.id = ?
      `).get(req.params.id);

      if (!quote) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Quote not found' }));
      }

      const newStatus = String(req.body?.status || '').trim();
      if (!newStatus) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'status is required' }));
      }

      const isAdmin = req.user.role === 'admin';
      const isCarOwner = quote.car_owner_id === req.user.id;
      const isCustomer = quote.customer_id === req.user.id;

      if (!isAdmin && !isCarOwner && !isCustomer) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      // Car owners can accept or decline; customers can cancel their own pending quote
      if (!isAdmin) {
        if (isCarOwner && !['accepted', 'declined'].includes(newStatus)) {
          return res.status(400).json(apiResponse(null, {
            code: 'INVALID_TRANSITION',
            message: 'Car owner can accept or decline a quote',
          }));
        }
        if (isCustomer && !isCarOwner) {
          if (newStatus !== 'cancelled') {
            return res.status(400).json(apiResponse(null, {
              code: 'INVALID_TRANSITION',
              message: 'Customers can only cancel their pending quotes',
            }));
          }
          if (quote.status !== 'pending') {
            return res.status(400).json(apiResponse(null, {
              code: 'INVALID_TRANSITION',
              message: 'Can only cancel pending quotes',
            }));
          }
        }
      }

      db.prepare(`
        UPDATE quotes SET status = ?, updated_at = datetime('now') WHERE id = ?
      `).run(newStatus, quote.id);

      const updated = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quote.id);
      return res.json(apiResponse(updated));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });
}

module.exports = { registerQuotesRoutes };
