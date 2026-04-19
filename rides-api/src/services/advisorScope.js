function getDogProfilesForAdvisorScope({
  req,
  dogs,
  db,
  isStaff,
  requestedStoreId,
  getUserScopedStoreIds,
}) {
  if (!req?.user) return [];

  // Customer-facing roles can only access their own dogs.
  if (req.user.role === 'customer' || req.user.role === 'business_member') {
    return dogs.filter((d) => d.user_id === req.user.id);
  }

  // Staff/manager/admin can be scoped by store.
  if (isStaff(req.user)) {
    let storeIds = [];
    if (req.user.role === 'admin') {
      const requested = requestedStoreId(req);
      storeIds = requested ? [requested] : [];
    } else {
      const assigned = getUserScopedStoreIds(req);
      const requested = requestedStoreId(req);
      storeIds = requested && assigned.includes(requested) ? [requested] : assigned;
    }

    // Preserve existing behavior for admin with no explicit store scope.
    if (storeIds.length === 0) {
      return req.user.role === 'admin' ? dogs : [];
    }

    const placeholdersA = storeIds.map(() => '?').join(', ');
    const placeholdersB = storeIds.map(() => '?').join(', ');
    const rows = db.prepare(`
      SELECT DISTINCT u.id
      FROM users u
      LEFT JOIN user_store_links l ON l.user_id = u.id AND l.is_active = 1
      WHERE (u.store_id IN (${placeholdersA}) OR l.store_id IN (${placeholdersB}))
    `).all(...storeIds, ...storeIds);
    const allowedUserIds = new Set(rows.map((r) => r.id));
    return dogs.filter((d) => allowedUserIds.has(d.user_id));
  }

  return [];
}

module.exports = {
  getDogProfilesForAdvisorScope,
};

