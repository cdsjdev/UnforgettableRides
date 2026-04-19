function registerCarsRoutes({
  app,
  apiResponse,
  db,
  uuidv4,
  multer,
  uploadsDir,
  path,
  fs,
  authMiddleware,
  roleGuard,
  isStaff,
}) {
  // Disk-based multer for car image uploads
  const carImageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.jpg';
      cb(null, `car-${uuidv4()}${ext}`);
    },
  });
  const carImageUpload = multer({
    storage: carImageStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) return cb(null, true);
      cb(new Error('Only image files are allowed'), false);
    },
  });

  // ── GET /api/v1/cars ─────────────────────────────────────────
  // Public browse with optional filters
  app.get('/api/v1/cars', (req, res) => {
    try {
      const tag = String(req.query.tag || '').trim();
      const make = String(req.query.make || '').trim();
      const yearMin = req.query.year_min ? parseInt(req.query.year_min, 10) : null;
      const yearMax = req.query.year_max ? parseInt(req.query.year_max, 10) : null;
      const location = String(req.query.location || '').trim();
      const availableOnly = req.query.available_only !== 'false';
      const rawLimit = parseInt(req.query.limit || '20', 10);
      const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 50);
      const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);

      let sql = `
        SELECT
          c.*,
          (
            SELECT ci.url
            FROM car_images ci
            WHERE ci.car_id = c.id
            ORDER BY ci.is_primary DESC, ci.sort_order ASC, ci.created_at ASC
            LIMIT 1
          ) AS primary_image_url,
          COALESCE((
            SELECT AVG(r.rating)
            FROM reviews r
            WHERE r.car_id = c.id AND r.is_active = 1
          ), 0) AS average_rating,
          (
            SELECT COUNT(r2.id)
            FROM reviews r2
            WHERE r2.car_id = c.id AND r2.is_active = 1
          ) AS review_count
        FROM classic_cars c
        WHERE c.is_active = 1
      `;
      const params = [];

      if (availableOnly) {
        sql += ' AND c.available_for_hire = 1';
      }
      if (make) {
        sql += ' AND LOWER(c.make) LIKE ?';
        params.push(`%${make.toLowerCase()}%`);
      }
      if (Number.isFinite(yearMin)) {
        sql += ' AND c.year >= ?';
        params.push(yearMin);
      }
      if (Number.isFinite(yearMax)) {
        sql += ' AND c.year <= ?';
        params.push(yearMax);
      }
      if (location) {
        sql += ' AND LOWER(c.location) LIKE ?';
        params.push(`%${location.toLowerCase()}%`);
      }
      if (tag) {
        sql += ' AND c.tags LIKE ?';
        params.push(`%${tag}%`);
      }

      sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = db.prepare(sql).all(...params);
      const cars = rows.map((row) => ({
        ...row,
        tags: (() => { try { return JSON.parse(row.tags || '[]'); } catch (_) { return []; } })(),
        average_rating: Math.round(Number(row.average_rating || 0) * 10) / 10,
        review_count: Number(row.review_count || 0),
      }));

      return res.json(apiResponse({ items: cars, limit, offset }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── GET /api/v1/cars/featured ─────────────────────────────────
  // 6 cars sorted by average rating desc, then newest
  app.get('/api/v1/cars/featured', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT c.*,
               COALESCE(AVG(r.rating), 0) AS average_rating,
               COUNT(r.id) AS review_count
        FROM classic_cars c
        LEFT JOIN reviews r ON r.car_id = c.id AND r.is_active = 1
        WHERE c.is_active = 1 AND c.available_for_hire = 1
        GROUP BY c.id
        ORDER BY average_rating DESC, c.created_at DESC
        LIMIT 6
      `).all();

      const cars = rows.map((row) => {
        const images = db.prepare(
          'SELECT * FROM car_images WHERE car_id = ? ORDER BY sort_order ASC, created_at ASC'
        ).all(row.id);
        return {
          ...row,
          tags: (() => { try { return JSON.parse(row.tags || '[]'); } catch (_) { return []; } })(),
          images,
          average_rating: Math.round(Number(row.average_rating || 0) * 10) / 10,
          review_count: Number(row.review_count || 0),
        };
      });

      return res.json(apiResponse(cars));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── GET /api/v1/cars/:id ──────────────────────────────────────
  // Car detail with images, owner info, ratings, reviews
  app.get('/api/v1/cars/:id', (req, res) => {
    try {
      const car = db.prepare('SELECT * FROM classic_cars WHERE id = ? AND is_active = 1').get(req.params.id);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }

      const owner = db.prepare('SELECT id, name, avatar_url FROM users WHERE id = ?').get(car.owner_id);
      const images = db.prepare(
        'SELECT * FROM car_images WHERE car_id = ? ORDER BY sort_order ASC, created_at ASC'
      ).all(car.id);

      const ratingRow = db.prepare(`
        SELECT COALESCE(AVG(rating), 0) AS average_rating, COUNT(id) AS review_count
        FROM reviews WHERE car_id = ? AND is_active = 1
      `).get(car.id);

      const reviews = db.prepare(`
        SELECT r.*, u.name AS reviewer_name, u.avatar_url AS reviewer_avatar_url
        FROM reviews r
        LEFT JOIN users u ON u.id = r.reviewer_id
        WHERE r.car_id = ? AND r.is_active = 1
        ORDER BY r.created_at DESC
        LIMIT 10
      `).all(car.id);

      return res.json(apiResponse({
        ...car,
        tags: (() => { try { return JSON.parse(car.tags || '[]'); } catch (_) { return []; } })(),
        images,
        owner: owner ? { id: owner.id, name: owner.name, avatar_url: owner.avatar_url } : null,
        average_rating: Math.round(Number(ratingRow.average_rating || 0) * 10) / 10,
        review_count: Number(ratingRow.review_count || 0),
        reviews: reviews.map((r) => ({
          ...r,
          photo_urls: (() => { try { return JSON.parse(r.photo_urls || '[]'); } catch (_) { return []; } })(),
        })),
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── POST /api/v1/cars ─────────────────────────────────────────
  // Create a car listing; requires owner or admin role
  app.post('/api/v1/cars', roleGuard('owner', 'admin'), (req, res) => {
    try {
      const make = String(req.body?.make || '').trim();
      const model = String(req.body?.model || '').trim();
      const year = parseInt(req.body?.year, 10);
      const color = String(req.body?.color || '').trim();

      if (!make || !model || !Number.isFinite(year) || !color) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: 'make, model, year, and color are required',
        }));
      }

      const id = uuidv4();
      const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
      const tagsJson = JSON.stringify(tags);

      db.prepare(`
        INSERT INTO classic_cars
        (id, owner_id, make, model, year, color, description, tags,
         price_per_hour_cents, price_per_day_cents, location, latitude, longitude,
         available_for_hire, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
      `).run(
        id,
        req.user.id,
        make,
        model,
        year,
        color,
        String(req.body?.description || '').trim() || null,
        tagsJson,
        req.body?.price_per_hour_cents != null ? parseInt(req.body.price_per_hour_cents, 10) : null,
        req.body?.price_per_day_cents != null ? parseInt(req.body.price_per_day_cents, 10) : null,
        String(req.body?.location || '').trim() || null,
        req.body?.latitude != null ? Number(req.body.latitude) : null,
        req.body?.longitude != null ? Number(req.body.longitude) : null
      );

      const created = db.prepare('SELECT * FROM classic_cars WHERE id = ?').get(id);
      return res.status(201).json(apiResponse({
        ...created,
        tags: (() => { try { return JSON.parse(created.tags || '[]'); } catch (_) { return []; } })(),
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── PUT /api/v1/cars/:id ──────────────────────────────────────
  // Update a car; must be car owner or admin
  app.put('/api/v1/cars/:id', (req, res) => {
    try {
      const car = db.prepare('SELECT * FROM classic_cars WHERE id = ? AND is_active = 1').get(req.params.id);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }
      if (car.owner_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      const updates = [];
      const params = [];

      const fields = ['make', 'model', 'color', 'description', 'location'];
      for (const f of fields) {
        if (req.body?.[f] !== undefined) {
          updates.push(`${f} = ?`);
          params.push(String(req.body[f] || '').trim() || null);
        }
      }
      if (req.body?.year !== undefined) {
        const y = parseInt(req.body.year, 10);
        if (!Number.isFinite(y)) {
          return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'year must be a number' }));
        }
        updates.push('year = ?');
        params.push(y);
      }
      if (req.body?.tags !== undefined) {
        updates.push('tags = ?');
        params.push(JSON.stringify(Array.isArray(req.body.tags) ? req.body.tags : []));
      }
      if (req.body?.price_per_hour_cents !== undefined) {
        updates.push('price_per_hour_cents = ?');
        params.push(req.body.price_per_hour_cents != null ? parseInt(req.body.price_per_hour_cents, 10) : null);
      }
      if (req.body?.price_per_day_cents !== undefined) {
        updates.push('price_per_day_cents = ?');
        params.push(req.body.price_per_day_cents != null ? parseInt(req.body.price_per_day_cents, 10) : null);
      }
      if (req.body?.latitude !== undefined) {
        updates.push('latitude = ?');
        params.push(req.body.latitude != null ? Number(req.body.latitude) : null);
      }
      if (req.body?.longitude !== undefined) {
        updates.push('longitude = ?');
        params.push(req.body.longitude != null ? Number(req.body.longitude) : null);
      }
      if (req.body?.available_for_hire !== undefined) {
        updates.push('available_for_hire = ?');
        params.push(req.body.available_for_hire ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'No valid fields to update' }));
      }

      updates.push("updated_at = datetime('now')");
      params.push(car.id);

      db.prepare(`UPDATE classic_cars SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      const updated = db.prepare('SELECT * FROM classic_cars WHERE id = ?').get(car.id);
      return res.json(apiResponse({
        ...updated,
        tags: (() => { try { return JSON.parse(updated.tags || '[]'); } catch (_) { return []; } })(),
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── DELETE /api/v1/cars/:id ───────────────────────────────────
  // Soft delete (set is_active = 0); must be car owner or admin
  app.delete('/api/v1/cars/:id', (req, res) => {
    try {
      const car = db.prepare('SELECT * FROM classic_cars WHERE id = ?').get(req.params.id);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }
      if (car.owner_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      db.prepare("UPDATE classic_cars SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(car.id);
      return res.json(apiResponse({ deleted: true, id: car.id }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── POST /api/v1/cars/:id/images ──────────────────────────────
  // Upload an image for a car; must be car owner or admin
  app.post('/api/v1/cars/:id/images', carImageUpload.single('image'), (req, res) => {
    try {
      const car = db.prepare('SELECT * FROM classic_cars WHERE id = ? AND is_active = 1').get(req.params.id);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }
      if (car.owner_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }
      if (!req.file) {
        return res.status(400).json(apiResponse(null, { code: 'NO_FILE', message: 'No image file provided' }));
      }

      const existingCount = db.prepare('SELECT COUNT(*) AS cnt FROM car_images WHERE car_id = ?').get(car.id);
      const isFirst = Number(existingCount.cnt || 0) === 0;
      const sortOrder = Number(existingCount.cnt || 0);
      const imageId = uuidv4();
      const url = `/uploads/${req.file.filename}`;

      db.prepare(`
        INSERT INTO car_images (id, car_id, url, is_primary, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(imageId, car.id, url, isFirst ? 1 : 0, sortOrder);

      const created = db.prepare('SELECT * FROM car_images WHERE id = ?').get(imageId);
      return res.status(201).json(apiResponse(created));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── DELETE /api/v1/cars/:id/images/:imageId ───────────────────
  // Delete an image from a car; must be car owner or admin
  app.delete('/api/v1/cars/:id/images/:imageId', (req, res) => {
    try {
      const car = db.prepare('SELECT * FROM classic_cars WHERE id = ? AND is_active = 1').get(req.params.id);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }
      if (car.owner_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      const image = db.prepare('SELECT * FROM car_images WHERE id = ? AND car_id = ?').get(req.params.imageId, car.id);
      if (!image) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Image not found' }));
      }

      db.prepare('DELETE FROM car_images WHERE id = ?').run(image.id);

      // Try to remove the file from disk (best effort)
      try {
        const filePath = path.join(uploadsDir, path.basename(image.url));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) { /* best effort */ }

      // If we deleted the primary image, promote the next image
      if (image.is_primary) {
        const next = db.prepare(
          'SELECT id FROM car_images WHERE car_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1'
        ).get(car.id);
        if (next) {
          db.prepare('UPDATE car_images SET is_primary = 1 WHERE id = ?').run(next.id);
        }
      }

      return res.json(apiResponse({ deleted: true, id: image.id }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── POST /api/v1/cars/:carId/reviews ──────────────────────��──
  // Leave a review; must have a completed booking for this car
  app.post('/api/v1/cars/:carId/reviews', (req, res) => {
    try {
      const car = db.prepare('SELECT * FROM classic_cars WHERE id = ? AND is_active = 1').get(req.params.carId);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }

      // Verify caller has a completed booking for this car
      const completedBooking = db.prepare(`
        SELECT id FROM bookings
        WHERE car_id = ? AND customer_id = ? AND status = 'completed'
        LIMIT 1
      `).get(car.id, req.user.id);
      if (!completedBooking && req.user.role !== 'admin') {
        return res.status(403).json(apiResponse(null, {
          code: 'FORBIDDEN',
          message: 'A completed booking is required to leave a review',
        }));
      }

      const rating = parseInt(req.body?.rating, 10);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'rating must be between 1 and 5' }));
      }

      const reviewId = uuidv4();
      const photoUrls = Array.isArray(req.body?.photo_urls) ? req.body.photo_urls : [];
      const bookingId = req.body?.booking_id || completedBooking?.id || null;

      db.prepare(`
        INSERT INTO reviews (id, car_id, booking_id, reviewer_id, rating, text, photo_urls, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
      `).run(
        reviewId,
        car.id,
        bookingId,
        req.user.id,
        rating,
        String(req.body?.text || '').trim() || null,
        JSON.stringify(photoUrls)
      );

      const created = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
      return res.status(201).json(apiResponse({
        ...created,
        photo_urls: (() => { try { return JSON.parse(created.photo_urls || '[]'); } catch (_) { return []; } })(),
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── GET /api/v1/cars/:carId/availability ─────────────────────
  // Public — returns blocked dates for a car
  app.get('/api/v1/cars/:carId/availability', (req, res) => {
    try {
      const car = db.prepare('SELECT id FROM classic_cars WHERE id = ? AND is_active = 1').get(req.params.carId);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }

      const rows = db.prepare(
        'SELECT * FROM car_availability WHERE car_id = ? ORDER BY blocked_date ASC'
      ).all(car.id);

      return res.json(apiResponse({ blocked_dates: rows }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── POST /api/v1/cars/:carId/availability ─────────────────────
  // Block a date for a car; must be car owner
  app.post('/api/v1/cars/:carId/availability', (req, res) => {
    try {
      const car = db.prepare('SELECT * FROM classic_cars WHERE id = ? AND is_active = 1').get(req.params.carId);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }
      if (car.owner_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      const blockedDate = String(req.body?.blocked_date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(blockedDate)) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: 'blocked_date must be in YYYY-MM-DD format',
        }));
      }

      const id = uuidv4();
      db.prepare(`
        INSERT INTO car_availability (id, car_id, blocked_date, reason, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(id, car.id, blockedDate, String(req.body?.reason || '').trim() || null);

      const created = db.prepare('SELECT * FROM car_availability WHERE id = ?').get(id);
      return res.status(201).json(apiResponse(created));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });

  // ── DELETE /api/v1/cars/:carId/availability/:id ───────────────
  // Remove a blocked date; must be car owner
  app.delete('/api/v1/cars/:carId/availability/:id', (req, res) => {
    try {
      const car = db.prepare('SELECT * FROM classic_cars WHERE id = ? AND is_active = 1').get(req.params.carId);
      if (!car) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Car not found' }));
      }
      if (car.owner_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }

      const row = db.prepare(
        'SELECT * FROM car_availability WHERE id = ? AND car_id = ?'
      ).get(req.params.id, car.id);
      if (!row) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Availability entry not found' }));
      }

      db.prepare('DELETE FROM car_availability WHERE id = ?').run(row.id);
      return res.json(apiResponse({ deleted: true, id: row.id }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });
}

module.exports = { registerCarsRoutes };
