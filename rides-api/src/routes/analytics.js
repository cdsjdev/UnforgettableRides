function registerAnalyticsRoutes({
  app,
  apiResponse,
  db,
}) {
  // ── GET /api/v1/analytics/summary ────────────────────────────
  app.get('/api/v1/analytics/summary', (req, res) => {
    try {
      const totalCars = db.prepare(
        "SELECT COUNT(*) AS n FROM classic_cars WHERE is_active = 1"
      ).get().n;

      const totalBookings = db.prepare(
        "SELECT COUNT(*) AS n FROM bookings"
      ).get().n;

      const totalRevenue = db.prepare(
        "SELECT COALESCE(SUM(total_price_cents), 0) AS n FROM bookings WHERE status = 'completed'"
      ).get().n;

      const statusRows = db.prepare(
        "SELECT status, COUNT(*) AS n FROM bookings GROUP BY status"
      ).all();

      const bookingsByStatus = {};
      for (const row of statusRows) {
        bookingsByStatus[row.status] = row.n;
      }

      return res.json(apiResponse({
        total_cars: totalCars,
        total_bookings: totalBookings,
        total_revenue_cents: totalRevenue,
        bookings_by_status: bookingsByStatus,
      }));
    } catch (err) {
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });
}

module.exports = { registerAnalyticsRoutes };
