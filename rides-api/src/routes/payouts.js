function registerPayoutsRoutes({
  app,
  apiResponse,
  roleGuard,
  db,
  uuidv4,
}) {
  // ── GET /api/v1/payouts ───────────────────────────────────────
  app.get('/api/v1/payouts', (req, res) => {
    try {
      const params = [];
      let sql;

      if (req.user.role === 'admin') {
        sql = 'SELECT p.*, u.name AS owner_name, u.email AS owner_email FROM payouts p LEFT JOIN users u ON u.id = p.owner_id WHERE 1=1';
      } else if (req.user.role === 'owner') {
        sql = 'SELECT p.*, u.name AS owner_name, u.email AS owner_email FROM payouts p LEFT JOIN users u ON u.id = p.owner_id WHERE p.owner_id = ?';
        params.push(req.user.id);
      } else {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      const status = String(req.query.status || '').trim();
      if (status) {
        sql += ' AND p.status = ?';
        params.push(status);
      }

      sql += ' ORDER BY p.created_at DESC';
      const rows = db.prepare(sql).all(...params);
      return res.json(apiResponse(rows));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── POST /api/v1/payouts ──────────────────────────────────────
  // Admin only — create a payout record
  app.post('/api/v1/payouts', roleGuard('admin'), (req, res) => {
    try {
      const ownerId = String(req.body?.owner_id || '').trim();
      const amountCents = parseInt(req.body?.amount_cents, 10);
      const currency = String(req.body?.currency || 'USD').trim().toUpperCase();

      if (!ownerId || !Number.isFinite(amountCents) || amountCents <= 0) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: 'owner_id and a positive amount_cents are required',
        }));
      }

      const owner = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(ownerId);
      if (!owner) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Owner user not found' }));
      }

      const id = uuidv4();
      db.prepare(`
        INSERT INTO payouts
        (id, owner_id, amount_cents, currency, period_start, period_end, status, stripe_transfer_id, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, datetime('now'), datetime('now'))
      `).run(
        id,
        ownerId,
        amountCents,
        currency,
        String(req.body?.period_start || '').trim() || null,
        String(req.body?.period_end || '').trim() || null,
        String(req.body?.notes || '').trim() || null
      );

      const created = db.prepare('SELECT * FROM payouts WHERE id = ?').get(id);
      return res.status(201).json(apiResponse(created));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── PATCH /api/v1/payouts/:id/status ─────────────────────────
  // Admin only — update payout status
  app.patch('/api/v1/payouts/:id/status', roleGuard('admin'), (req, res) => {
    try {
      const payout = db.prepare('SELECT * FROM payouts WHERE id = ?').get(req.params.id);
      if (!payout) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Payout not found' }));
      }

      const newStatus = String(req.body?.status || '').trim();
      const validStatuses = ['pending', 'processing', 'paid', 'failed'];
      if (!validStatuses.includes(newStatus)) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: `status must be one of: ${validStatuses.join(', ')}`,
        }));
      }

      const stripeTransferId = req.body?.stripe_transfer_id != null
        ? String(req.body.stripe_transfer_id).trim() || null
        : payout.stripe_transfer_id;

      db.prepare(`
        UPDATE payouts
        SET status = ?, stripe_transfer_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, stripeTransferId, payout.id);

      const updated = db.prepare('SELECT * FROM payouts WHERE id = ?').get(payout.id);
      return res.json(apiResponse(updated));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });
}

module.exports = { registerPayoutsRoutes };
