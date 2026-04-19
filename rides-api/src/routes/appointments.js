const { normalizeSquarePaymentStatus, extractSquareErrorMessage } = require('./payment-utils');

function registerAppointmentsRoutes({
  app,
  apiResponse,
  roleGuard,
  db,
  isStaff,
  appendStoreScope,
  getSetting,
  normalizeStoreId,
  resolveStoreScope,
  resolveWriteStoreId,
  canAccessStoreScopedRecord,
  multer,
  uploadsDir,
  uuidv4,
  path,
  FormData,
  fs,
  axios,
  getRequestKeys,
  getAvailableProviders,
  getProviderModel,
  getEffectiveKey,
  LLM_PROVIDERS,
  insertAppointment,
  sendNotification,
  getBusinessMemberForCustomer,
  computeDiscount,
  computePoints,
  awardBusinessMemberPoints,
  isAuthRequireVerifiedForSensitive,
  sendEmailNotification,
  squareClient,
  SQUARE_LOCATION_ID,
  PAYMENT_CURRENCY,
}) {
  const APPOINTMENT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!email) return null;
    if (!APPOINTMENT_EMAIL_REGEX.test(email)) return null;
    return email;
  }

  function formatAppointmentDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatAppointmentTime(timeStr) {
    if (!timeStr || !String(timeStr).includes(':')) return String(timeStr || '');
    const [h, m] = String(timeStr).split(':');
    const hour = Number(h);
    if (!Number.isFinite(hour)) return String(timeStr);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
  }

  function labelService(serviceType) {
    const map = {
      wash: 'Bath/Wash',
      groom: 'Grooming',
      nail_trim: 'Nail Trim',
      full_service: 'Full Service',
    };
    return map[String(serviceType || '').trim()] || String(serviceType || 'Service');
  }

  function resolvePublicAppBaseUrl(req) {
    const configured = String(getSetting('public_app_base_url', process.env.PUBLIC_APP_BASE_URL || '') || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    const origin = String(req?.headers?.origin || '').trim();
    if (/^https?:\/\//i.test(origin)) return origin.replace(/\/+$/, '');
    const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http';
    const host = req?.headers?.host || 'localhost:8081';
    return `${proto}://${host}`;
  }

  function resolveAppointmentManageLinks(req, appointmentId) {
    const base = resolvePublicAppBaseUrl(req);
    const encodedId = encodeURIComponent(String(appointmentId || ''));
    return {
      manageUrl: `${base}/care/appointments?appointment_id=${encodedId}`,
    };
  }

  function findAppointmentRecipientEmail(req, appointment) {
    const bodyEmail = normalizeEmail(req?.body?.customer_email);
    if (bodyEmail) return bodyEmail;
    const apptEmail = normalizeEmail(appointment?.customer_email);
    if (apptEmail) return apptEmail;
    const reqUserEmail = normalizeEmail(req?.user?.email);
    if (reqUserEmail) return reqUserEmail;
    if (appointment?.user_id) {
      const row = db.prepare('SELECT email FROM users WHERE id = ?').get(appointment.user_id);
      const userEmail = normalizeEmail(row?.email);
      if (userEmail) return userEmail;
    }
    return null;
  }

  async function sendAppointmentLifecycleEmail(req, type, appointment, extra = {}) {
    const to = findAppointmentRecipientEmail(req, appointment);
    if (!to || typeof sendEmailNotification !== 'function') return null;
    const links = resolveAppointmentManageLinks(req, appointment.id);
    const service = labelService(appointment.service_type);
    const whenText = `${formatAppointmentDate(appointment.date)} at ${formatAppointmentTime(appointment.time)}`;
    const dog = String(appointment.dog_name || 'your dog');

    let subject = 'UnforgettableRides appointment update';
    let intro = `Your appointment has been updated for ${whenText}.`;
    if (type === 'created') {
      subject = 'UnforgettableRides appointment confirmation';
      intro = `${dog}'s ${service} is scheduled for ${whenText}.`;
    } else if (type === 'rescheduled') {
      subject = 'UnforgettableRides appointment rescheduled';
      const oldWhen = extra.oldDate && extra.oldTime
        ? `${formatAppointmentDate(extra.oldDate)} at ${formatAppointmentTime(extra.oldTime)}`
        : null;
      intro = oldWhen
        ? `${dog}'s ${service} was moved from ${oldWhen} to ${whenText}.`
        : `${dog}'s ${service} has been moved to ${whenText}.`;
    } else if (type === 'cancelled') {
      subject = 'UnforgettableRides appointment cancellation confirmation';
      intro = `${dog}'s ${service} on ${whenText} has been cancelled.`;
    }

    const text = [
      'Hello,',
      '',
      intro,
      '',
      `Appointment ID: ${appointment.id}`,
      '',
      'Manage appointment:',
      links.manageUrl,
      '',
      'Open this page to reschedule or cancel:',
      links.manageUrl,
      '',
      'Thank you,',
      'UnforgettableRides',
    ].join('\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0F172A;background:#F8FAFC;padding:20px;">
        <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;padding:22px;">
          <h2 style="margin:0 0 10px 0;font-size:20px;font-weight:600;color:#0F172A;">${subject}</h2>
          <p style="margin:0 0 12px 0;">${intro}</p>
          <p style="margin:0 0 12px 0;"><strong>Appointment ID:</strong> ${appointment.id}</p>
          <p style="margin:0 0 8px 0;">You can manage this appointment here:</p>
          <p style="margin:0 0 14px 0;"><a href="${links.manageUrl}" target="_blank" rel="noopener noreferrer">Open Appointments</a></p>
          <p style="margin:0 0 14px 0;color:#475569;">Use the Reschedule and Cancel actions on that page.</p>
          <p style="margin:0;color:#64748B;">Thank you,<br/>UnforgettableRides</p>
        </div>
      </div>
    `.trim();

    const sent = await sendEmailNotification({
      kind: type === 'created' ? 'appointment_confirmation' : type === 'cancelled' ? 'appointment_cancellation' : 'appointment_reschedule',
      to,
      payload: {
        subject,
        message: text,
        text,
        html,
        appointment_id: appointment.id,
        service_type: appointment.service_type,
        date: appointment.date,
        time: appointment.time,
      },
    });
    return sent ? to : null;
  }

  function ensureVerifiedForSensitive(req, res) {
    if (!isAuthRequireVerifiedForSensitive()) return true;
    if (isStaff(req.user)) return true;
    if (req.user?.email_verified_at) return true;
    res.status(403).json(apiResponse(null, {
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'Please verify your email before this action.',
    }));
    return false;
  }

  // Backward-compatible schema upgrades for deposit-first assessment pricing.
  try { db.prepare("ALTER TABLE appointments ADD COLUMN store_service_id TEXT").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE appointments ADD COLUMN pricing_mode TEXT DEFAULT 'fixed'").run(); } catch (_) {}
  try { db.prepare("ALTER TABLE appointments ADD COLUMN deposit_required_amount REAL DEFAULT 0").run(); } catch (_) {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointment_deposits (
      id TEXT PRIMARY KEY,
      appointment_id TEXT NOT NULL,
      user_id TEXT,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'charged' CHECK(status IN ('charged', 'refunded')),
      note TEXT,
      created_by_user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    );
    CREATE INDEX IF NOT EXISTS idx_appointment_deposits_appt ON appointment_deposits(appointment_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_appointment_deposits_status ON appointment_deposits(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS appointment_deposit_payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT,
      service_type TEXT,
      store_service_id TEXT,
      amount REAL NOT NULL,
      provider TEXT NOT NULL DEFAULT 'square',
      provider_payment_id TEXT,
      status TEXT NOT NULL DEFAULT 'succeeded',
      idempotency_key TEXT,
      used_for_appointment_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_appointment_deposit_payments_user_status ON appointment_deposit_payments(user_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_deposit_payments_idempotency ON appointment_deposit_payments(idempotency_key);
  `);

  function getAssessmentDepositAmount(storeId, serviceType) {
    const scoped = Number(getSetting(`appointment_deposit_${String(serviceType || '').trim()}`, '30', storeId || null));
    const generic = Number(getSetting('appointment_deposit_default', '30', storeId || null));
    const fallback = Number.isFinite(scoped) ? scoped : generic;
    if (!Number.isFinite(fallback) || fallback < 0) return 0;
    return Math.round(fallback * 100) / 100;
  }

  function getAppointmentDepositPaidTotal(appointmentId) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM appointment_deposits
      WHERE appointment_id = ? AND status = 'charged'
    `).get(appointmentId);
    return Math.round((Number(row?.total || 0)) * 100) / 100;
  }

  const isSquareEnabled = Boolean(squareClient && SQUARE_LOCATION_ID);
  
  // GET /api/v1/appointments - List appointments
  // List appointments â€” staff sees all, customers see only their own
  app.get('/api/v1/appointments', (req, res) => {
    try {
      const { date, status, from_date, to_date } = req.query;
      const parsedLimit = parseInt(req.query.limit || '50', 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'limit must be a positive integer' }));
      }
      let sql = `
        SELECT a.*,
               CASE
                 WHEN EXISTS (
                   SELECT 1
                   FROM appointment_charges ac
                   WHERE ac.appointment_id = a.id AND ac.status = 'charged'
                 ) THEN 1
                 ELSE 0
               END as is_charged,
               COALESCE((
                 SELECT SUM(ad.amount)
                 FROM appointment_deposits ad
                 WHERE ad.appointment_id = a.id AND ad.status = 'charged'
               ), 0) AS deposit_paid_total,
               CASE
                 WHEN COALESCE((
                   SELECT SUM(ad.amount)
                   FROM appointment_deposits ad
                   WHERE ad.appointment_id = a.id AND ad.status = 'charged'
                 ), 0) > 0 THEN 1
                 ELSE 0
               END AS is_deposit_paid
        FROM appointments a
        WHERE 1=1
      `;
      const params = [];
  
      // Customers can only see their own appointments
      if (!isStaff(req.user)) {
        sql += ' AND a.user_id = ?';
        params.push(req.user.id);
      }
  
      sql = appendStoreScope(sql, params, req, 'a.store_id', { includeNullFallback: true });
  
      if (date) {
        sql += ' AND a.date = ?';
        params.push(date);
      } else {
        if (from_date) {
          sql += ' AND a.date >= ?';
          params.push(from_date);
        }
        if (to_date) {
          sql += ' AND a.date <= ?';
          params.push(to_date);
        }
      }
      if (status) { sql += ' AND a.status = ?'; params.push(status); }
  
      sql += ' ORDER BY a.date ASC, a.time ASC LIMIT ?';
      params.push(Math.min(parsedLimit, 1000));
  
      const appointments = db.prepare(sql).all(...params);
      res.json(apiResponse(appointments));
    } catch (err) {
      res.status(500).json(apiResponse(null, { code: 'SERVER_ERROR', message: err.message }));
    }
  });
  
  const APPOINTMENT_SERVICE_TYPES = new Set(['wash', 'groom', 'nail_trim', 'full_service', 'other']);
  const APPOINTMENT_ACTIVE_STATUSES_SQL = "('pending','confirmed','in_progress')";
  const APPOINTMENT_LIMIT_DEFAULTS = {
    max_active_per_customer: 3,
    max_new_per_day: 3,
    max_new_per_7d: 5,
    min_hours_between: 2,
  };
  
  function toIntOrDefault(raw, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
    const n = parseInt(String(raw ?? ''), 10);
    if (Number.isNaN(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }
  
  function parseMinutes(hhmm) {
    if (typeof hhmm !== 'string') return null;
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
  
  function normalizeAppointmentServiceType(raw) {
    const value = String(raw || 'wash').trim().toLowerCase();
    return APPOINTMENT_SERVICE_TYPES.has(value) ? value : null;
  }
  
  function buildStoreScopedWhere(column, storeId, params) {
    const scopedStoreId = normalizeStoreId(storeId);
    if (scopedStoreId) {
      params.push(scopedStoreId);
      return ` AND (${column} = ? OR ${column} IS NULL)`;
    }
    return '';
  }
  
  function getServicePolicy(storeId, serviceType) {
    const scopedStoreId = normalizeStoreId(storeId);
    const _open = toIntOrDefault(getSetting('store_open_hour', '9', scopedStoreId), 9, { min: 0, max: 23 });
    const _close = toIntOrDefault(getSetting('store_close_hour', '18', scopedStoreId), 18, { min: 1, max: 24 });
    const _slot = toIntOrDefault(getSetting('appointment_slot_minutes', '30', scopedStoreId), 30, { min: 15, max: 120 });
    const _globalMax = toIntOrDefault(getSetting('max_concurrent_appointments', '3', scopedStoreId), 3, { min: 1, max: 20 });
    const enabledRaw = String(getSetting(`appointment_service_enabled_${serviceType}`, '1', scopedStoreId)).trim().toLowerCase();
    const serviceEnabled = enabledRaw !== '0' && enabledRaw !== 'false' && enabledRaw !== 'off';
    const serviceMax = toIntOrDefault(
      getSetting(`appointment_service_max_concurrent_${serviceType}`, String(_globalMax), scopedStoreId),
      _globalMax,
      { min: 1, max: 20 }
    );
  
    return {
      storeOpen: _open,
      storeClose: _close,
      slotMinutes: _slot,
      maxConcurrent: serviceMax,
      serviceEnabled,
    };
  }
  
  function getCustomerBookingLimits(storeId) {
    const scopedStoreId = normalizeStoreId(storeId);
    return {
      maxActivePerCustomer: toIntOrDefault(
        getSetting('appointment_max_active_per_customer', String(APPOINTMENT_LIMIT_DEFAULTS.max_active_per_customer), scopedStoreId),
        APPOINTMENT_LIMIT_DEFAULTS.max_active_per_customer,
        { min: 1, max: 20 }
      ),
      maxNewPerDay: toIntOrDefault(
        getSetting('appointment_max_new_per_day', String(APPOINTMENT_LIMIT_DEFAULTS.max_new_per_day), scopedStoreId),
        APPOINTMENT_LIMIT_DEFAULTS.max_new_per_day,
        { min: 1, max: 20 }
      ),
      maxNewPer7d: toIntOrDefault(
        getSetting('appointment_max_new_per_7d', String(APPOINTMENT_LIMIT_DEFAULTS.max_new_per_7d), scopedStoreId),
        APPOINTMENT_LIMIT_DEFAULTS.max_new_per_7d,
        { min: 1, max: 50 }
      ),
      minHoursBetween: toIntOrDefault(
        getSetting('appointment_min_hours_between', String(APPOINTMENT_LIMIT_DEFAULTS.min_hours_between), scopedStoreId),
        APPOINTMENT_LIMIT_DEFAULTS.min_hours_between,
        { min: 0, max: 72 }
      ),
    };
  }
  
  function getBookedRowsForDate({ date, storeId, serviceType }) {
    const params = [date, serviceType];
    let sql = `SELECT time, duration_minutes
               FROM appointments
               WHERE date = ?
                 AND service_type = ?
                 AND status IN ${APPOINTMENT_ACTIVE_STATUSES_SQL}`;
    sql += buildStoreScopedWhere('store_id', storeId, params);
    return db.prepare(sql).all(...params);
  }
  
  function countOverlappingAppointments({ date, startMinutes, durationMinutes, storeId, serviceType }) {
    const endMinutes = startMinutes + durationMinutes;
    const bookedRows = getBookedRowsForDate({ date, storeId, serviceType });
    return bookedRows.filter((row) => {
      const bStart = parseMinutes(String(row.time || ''));
      if (bStart == null) return false;
      const bEnd = bStart + (Number(row.duration_minutes) || 60);
      return startMinutes < bEnd && endMinutes > bStart;
    }).length;
  }
  
  function validateCustomerBookingLimits({ userId, storeId, date, time }) {
    const limits = getCustomerBookingLimits(storeId);
    const storeParamsA = [userId];
    const storeScopedA = buildStoreScopedWhere('store_id', storeId, storeParamsA);
    const activeCount = db.prepare(`
      SELECT COUNT(*) AS c
      FROM appointments
      WHERE user_id = ?
        AND status IN ${APPOINTMENT_ACTIVE_STATUSES_SQL}
        AND datetime(date || ' ' || time) >= datetime('now')
        ${storeScopedA}
    `).get(...storeParamsA).c;
    if (Number(activeCount) >= limits.maxActivePerCustomer) {
      return { status: 409, code: 'BOOKING_LIMIT_ACTIVE_REACHED', message: `You can only hold ${limits.maxActivePerCustomer} active appointment(s).` };
    }
  
    const storeParamsB = [userId];
    const storeScopedB = buildStoreScopedWhere('store_id', storeId, storeParamsB);
    const dayCount = db.prepare(`
      SELECT COUNT(*) AS c
      FROM appointments
      WHERE user_id = ?
        AND status != 'cancelled'
        AND created_at >= datetime('now', 'start of day')
        ${storeScopedB}
    `).get(...storeParamsB).c;
    if (Number(dayCount) >= limits.maxNewPerDay) {
      return { status: 429, code: 'BOOKING_LIMIT_DAILY_REACHED', message: `Daily booking limit reached (${limits.maxNewPerDay}).` };
    }
  
    const storeParamsC = [userId];
    const storeScopedC = buildStoreScopedWhere('store_id', storeId, storeParamsC);
    const weeklyCount = db.prepare(`
      SELECT COUNT(*) AS c
      FROM appointments
      WHERE user_id = ?
        AND status != 'cancelled'
        AND created_at >= datetime('now', '-7 days')
        ${storeScopedC}
    `).get(...storeParamsC).c;
    if (Number(weeklyCount) >= limits.maxNewPer7d) {
      return { status: 429, code: 'BOOKING_LIMIT_WEEKLY_REACHED', message: `7-day booking limit reached (${limits.maxNewPer7d}).` };
    }
  
    if (limits.minHoursBetween > 0) {
      const storeParamsD = [userId, date, time, limits.minHoursBetween];
      const storeScopedD = buildStoreScopedWhere('store_id', storeId, storeParamsD);
      const tooCloseCount = db.prepare(`
        SELECT COUNT(*) AS c
        FROM appointments
        WHERE user_id = ?
          AND status IN ${APPOINTMENT_ACTIVE_STATUSES_SQL}
          AND datetime(date || ' ' || time) >= datetime('now')
          AND ABS((julianday(date || ' ' || time) - julianday(? || ' ' || ?)) * 24.0) < ?
          ${storeScopedD}
      `).get(...storeParamsD).c;
      if (Number(tooCloseCount) > 0) {
        return { status: 409, code: 'BOOKING_LIMIT_MIN_GAP', message: `Please keep at least ${limits.minHoursBetween} hour(s) between appointments.` };
      }
    }
    return null;
  }
  
  // GET /api/v1/appointments/availability - Check available time slots
  // NOTE: Must be defined BEFORE /:id to avoid being shadowed
  app.get('/api/v1/appointments/availability', (req, res) => {
    try {
      const { date } = req.query;
      const serviceType = normalizeAppointmentServiceType(req.query.service_type || 'wash');
      const requestedDuration = toIntOrDefault(req.query.duration_minutes, 0, { min: 0, max: 240 });
      if (!date) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'date query parameter required' }));
      }
      if (!serviceType) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'service_type is invalid' }));
      }

      const scope = resolveWriteStoreId(req);
      if (scope.error) {
        return res.status(scope.error.code === 'STORE_REQUIRED' ? 400 : 403).json(apiResponse(null, scope.error));
      }
      const scopedStoreId = scope.storeId || normalizeStoreId(req.query.store_id);
      const policy = getServicePolicy(scopedStoreId, serviceType);
      if (!policy.serviceEnabled) {
        return res.status(409).json(apiResponse(null, { code: 'SERVICE_DISABLED', message: `${serviceType} is not available for this store` }));
      }
      const booked = getBookedRowsForDate({ date, storeId: scopedStoreId, serviceType });
  
      // Generate time slots based on configured slot duration
      const slots = [];
      const openMinutes = policy.storeOpen * 60;
      const closeMinutes = policy.storeClose * 60;
      for (let mins = openMinutes; mins < closeMinutes; mins += policy.slotMinutes) {
        const slotDuration = requestedDuration > 0 ? requestedDuration : policy.slotMinutes;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const slotTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const slotEnd = mins + slotDuration;
        const withinHours = slotEnd <= closeMinutes;
        // Count overlapping appointments for this slot
        const overlapping = booked.filter(b => {
          const bStart = parseMinutes(String(b.time || ''));
          if (bStart == null) return false;
          const bEnd = bStart + (b.duration_minutes || 60);
          return mins < bEnd && slotEnd > bStart;
        });
        const remaining = Math.max(0, policy.maxConcurrent - overlapping.length);
        const available = withinHours && overlapping.length < policy.maxConcurrent;
  
        slots.push({
          time: slotTime,
          available,
          service_type: serviceType,
          remaining_capacity: remaining,
          reason: !withinHours
            ? 'Outside service hours'
            : (overlapping.length >= policy.maxConcurrent ? 'Fully booked' : undefined),
        });
      }
  
      res.json(apiResponse({ date, service_type: serviceType, slots }));
    } catch (err) {
      res.status(500).json(apiResponse(null, { code: 'SERVER_ERROR', message: err.message }));
    }
  });
  
  // POST /api/v1/appointments/voice-book - Record audio â†’ transcribe â†’ parse in one step
  const audioUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => cb(null, `voice-${uuidv4()}${path.extname(file.originalname) || '.m4a'}`),
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['audio/', 'video/mp4', 'application/octet-stream'];
      if (allowed.some(t => file.mimetype.startsWith(t)) || file.originalname.match(/\.(m4a|mp3|wav|webm|mp4|ogg|flac)$/i)) {
        cb(null, true);
      } else {
        cb(new Error('Only audio files are allowed'), false);
      }
    },
  });
  
  app.post('/api/v1/appointments/voice-book', audioUpload.single('audio'), async (req, res) => {
    let audioPath = null;
    try {
      if (!req.file) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'audio file is required' }));
      }
      audioPath = req.file.path;
      const reqKeys = getRequestKeys(req);
      const openaiKey = reqKeys._openai || process.env.OPENAI_API_KEY;
  
      if (!openaiKey) {
        return res.status(400).json(apiResponse(null, { code: 'CONFIG_ERROR', message: 'OpenAI API key is required for voice transcription. Add it in App Settings.' }));
      }
  
      // Step 1: Transcribe audio with Whisper
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioPath), {
        filename: req.file.originalname || 'recording.m4a',
        contentType: req.file.mimetype || 'audio/m4a',
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
  
      const whisperRes = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          ...formData.getHeaders(),
        },
        timeout: 30000,
      });
  
      const transcript = whisperRes.data.text;
      if (!transcript || !transcript.trim()) {
        return res.json(apiResponse({
          parsed: false,
          transcript: '',
          data: {},
          missing_fields: ['dog_name', 'service_type', 'date', 'time'],
          message: 'Could not understand audio. Please try again.',
        }));
      }
  
      // Step 2: Parse the transcript with LLM (or regex fallback)
      const available = getAvailableProviders(reqKeys);
      let result;
      if (available.length > 0) {
        try {
          result = await parseVoiceBookingLLM(transcript, available, reqKeys);
        } catch {
          // LLM failed, fall back to regex
          result = parseVoiceBooking(transcript);
          result.data._fallback = 'regex';
        }
      } else {
        result = parseVoiceBooking(transcript);
      }
      result.transcript = transcript;
      res.json(apiResponse(result));
    } catch (err) {
      res.status(500).json(apiResponse(null, { code: 'SERVER_ERROR', message: err.message }));
    } finally {
      // Clean up audio file
      if (audioPath) {
        fs.unlink(audioPath, () => {});
      }
    }
  });
  
  // POST /api/v1/appointments/parse-voice - Parse voice transcription into booking data
  app.post('/api/v1/appointments/parse-voice', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'text is required' }));
      }
  
      // Try LLM first, fall back to regex
      const reqKeys = getRequestKeys(req);
      const available = getAvailableProviders(reqKeys);
      let result;
      if (available.length > 0) {
        result = await parseVoiceBookingLLM(text, available, reqKeys);
      } else {
        result = parseVoiceBooking(text);
      }
      res.json(apiResponse(result));
    } catch (err) {
      // If LLM fails, fall back to regex
      try {
        const fallback = parseVoiceBooking(req.body.text);
        fallback.data._fallback = 'regex';
        res.json(apiResponse(fallback));
      } catch (e2) {
        res.status(500).json(apiResponse(null, { code: 'SERVER_ERROR', message: err.message }));
      }
    }
  });

  // GET /api/v1/appointments/deposit-config - Resolve deposit amount for assessment-priced services
  // NOTE: Must be defined BEFORE /:id to avoid being shadowed.
  app.get('/api/v1/appointments/deposit-config', (req, res) => {
    try {
      const normalizedServiceType = normalizeAppointmentServiceType(req.query.service_type || 'groom') || 'groom';
      let scopedStoreId = normalizeStoreId(req.query.store_id);
      if (!scopedStoreId) {
        const scope = resolveStoreScope(req);
        scopedStoreId = normalizeStoreId(scope?.storeId);
      }
      const depositAmount = getAssessmentDepositAmount(scopedStoreId, normalizedServiceType);
      res.json(apiResponse({
        store_id: scopedStoreId || null,
        service_type: normalizedServiceType,
        deposit_amount: depositAmount,
      }));
    } catch (err) {
      res.status(500).json(apiResponse(null, { code: 'SERVER_ERROR', message: err.message }));
    }
  });
  
  // GET /api/v1/appointments/:id - Get appointment
  app.get('/api/v1/appointments/:id', (req, res) => {
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!appt) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Appointment not found' }));
    }
    if (!canAccessStoreScopedRecord(req, appt.store_id, { includeNullFallback: true })) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
    }
    if (!isStaff(req.user) && appt.user_id !== req.user.id) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
    }
    const depositPaid = getAppointmentDepositPaidTotal(appt.id);
    res.json(apiResponse({
      ...appt,
      deposit_paid_total: depositPaid,
      is_deposit_paid: depositPaid > 0,
    }));
  });

  // POST /api/v1/appointments/deposit/charge - Charge booking deposit via Square for assessment-priced services
  app.post('/api/v1/appointments/deposit/charge', async (req, res) => {
    try {
      if (!ensureVerifiedForSensitive(req, res)) return;
      if (!isSquareEnabled) {
        return res.status(503).json(apiResponse(null, {
          code: 'SQUARE_NOT_CONFIGURED',
          message: 'Square payment processing is not configured.',
        }));
      }

      const sourceId = String(req.body?.source_id || '').trim();
      const idempotencyKey = String(req.body?.idempotency_key || `appt-dep-${uuidv4()}`).trim();
      const requestedStoreId = normalizeStoreId(req.body?.store_id);
      const selectedServiceId = String(req.body?.store_service_id || '').trim() || null;
      const requestedServiceType = normalizeAppointmentServiceType(req.body?.service_type || 'groom');

      if (!sourceId) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: 'source_id is required',
        }));
      }

      let storeId = requestedStoreId;
      let serviceType = requestedServiceType;
      if (selectedServiceId) {
        const svc = db.prepare(`
          SELECT id, store_id, service_type, price_on_assessment, is_active
          FROM store_services
          WHERE id = ?
          LIMIT 1
        `).get(selectedServiceId);
        if (!svc || Number(svc.is_active || 0) !== 1) {
          return res.status(400).json(apiResponse(null, {
            code: 'INVALID_STORE_SERVICE',
            message: 'Selected service is unavailable.',
          }));
        }
        storeId = normalizeStoreId(svc.store_id);
        serviceType = normalizeAppointmentServiceType(svc.service_type);
        if (!serviceType) {
          return res.status(400).json(apiResponse(null, {
            code: 'INVALID_STORE_SERVICE',
            message: 'Selected service type is invalid.',
          }));
        }
        if (Number(svc.price_on_assessment || 0) !== 1) {
          return res.status(400).json(apiResponse(null, {
            code: 'DEPOSIT_NOT_APPLICABLE',
            message: 'Deposit is only applicable to price-on-assessment services.',
          }));
        }
      }

      if (!storeId || !serviceType) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: 'store_id and service_type are required',
        }));
      }

      const amount = getAssessmentDepositAmount(storeId, serviceType);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json(apiResponse(null, {
          code: 'DEPOSIT_NOT_CONFIGURED',
          message: 'Deposit amount is not configured for this service.',
        }));
      }

      const existing = db.prepare(`
        SELECT *
        FROM appointment_deposit_payments
        WHERE idempotency_key = ? AND user_id = ?
        LIMIT 1
      `).get(idempotencyKey, req.user.id);
      if (existing) {
        return res.json(apiResponse({
          deposit_payment_id: existing.id,
          provider: existing.provider,
          provider_payment_id: existing.provider_payment_id || null,
          status: existing.status,
          amount: Number(existing.amount || 0),
          service_type: existing.service_type,
          store_id: existing.store_id,
        }));
      }

      const amountCents = Math.round(amount * 100);
      const squareResp = await squareClient.payments.create({
        sourceId,
        idempotencyKey,
        amountMoney: {
          amount: BigInt(amountCents),
          currency: String(PAYMENT_CURRENCY || 'usd').toUpperCase(),
        },
        locationId: String(SQUARE_LOCATION_ID),
        note: `UnforgettableRides appointment deposit (${serviceType})`,
        autocomplete: true,
        buyerEmailAddress: req.user?.email || undefined,
      });

      const squarePayment = squareResp?.payment || squareResp?.result?.payment;
      const normalizedStatus = normalizeSquarePaymentStatus(squarePayment?.status);
      if (normalizedStatus !== 'succeeded') {
        return res.status(502).json(apiResponse(null, {
          code: 'DEPOSIT_PAYMENT_NOT_COMPLETED',
          message: `Deposit payment status is ${normalizedStatus}.`,
        }));
      }

      const paymentRowId = `apdep-${uuidv4().slice(0, 12)}`;
      db.prepare(`
        INSERT INTO appointment_deposit_payments
          (id, user_id, store_id, service_type, store_service_id, amount, provider, provider_payment_id, status, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'square', ?, 'succeeded', ?, datetime('now'), datetime('now'))
      `).run(
        paymentRowId,
        req.user.id,
        storeId,
        serviceType,
        selectedServiceId,
        Math.round(amount * 100) / 100,
        squarePayment?.id || null,
        idempotencyKey
      );

      return res.status(201).json(apiResponse({
        deposit_payment_id: paymentRowId,
        provider: 'square',
        provider_payment_id: squarePayment?.id || null,
        status: 'succeeded',
        amount: Math.round(amount * 100) / 100,
        service_type: serviceType,
        store_id: storeId,
      }));
    } catch (err) {
      console.error('Appointment deposit charge error:', err);
      const msg = extractSquareErrorMessage(err);
      const providerStatusCode = Number(err?.statusCode || 0);
      const providerCode = String(err?.errors?.[0]?.code || '').toUpperCase();
      if (providerStatusCode === 401 || providerCode === 'UNAUTHORIZED') {
        return res.status(503).json(apiResponse(null, {
          code: 'SQUARE_AUTH_ERROR',
          message: 'Square credentials are invalid or expired. Please update SQUARE_ACCESS_TOKEN.',
        }));
      }
      return res.status(500).json(apiResponse(null, { code: 'PAYMENT_ERROR', message: msg }));
    }
  });
  
  // POST /api/v1/appointments - Create appointment
  app.post('/api/v1/appointments', async (req, res) => {
    try {
      if (!ensureVerifiedForSensitive(req, res)) return;
      const { dog_id, dog_name, customer_name, customer_phone, customer_email, service_type, store_service_id, date, time, duration_minutes, notes, booked_via } = req.body;
      const writeScope = resolveWriteStoreId(req);
      if (writeScope.error) {
        return res.status(writeScope.error.code === 'STORE_REQUIRED' ? 400 : 403).json(apiResponse(null, writeScope.error));
      }
      const createStoreId = writeScope.storeId;
  
      if (!dog_name || !date || !time) {
        return res.status(400).json(apiResponse(null, {
          code: 'INVALID_REQUEST',
          message: 'dog_name, date, and time are required',
        }));
      }
  
      const parsedDate = String(date).trim();
      const parsedTime = String(time).trim();
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(parsedDate);
      const startMinutes = parseMinutes(parsedTime);
      const normalizedServiceType = normalizeAppointmentServiceType(service_type || 'wash');
      const requestedDuration = Number(duration_minutes) || 60;
      if (!validDate || startMinutes == null) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'date or time format is invalid' }));
      }
      if (!normalizedServiceType) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'service_type is invalid' }));
      }
      if (!Number.isInteger(requestedDuration) || requestedDuration <= 0 || requestedDuration > 240) {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'duration_minutes must be between 1 and 240' }));
      }
  
      const policy = getServicePolicy(createStoreId, normalizedServiceType);
      if (!policy.serviceEnabled) {
        return res.status(409).json(apiResponse(null, { code: 'SERVICE_DISABLED', message: `${normalizedServiceType} is not available for this store` }));
      }
      const openMinutes = policy.storeOpen * 60;
      const closeMinutes = policy.storeClose * 60;
      if (startMinutes < openMinutes || (startMinutes + requestedDuration) > closeMinutes) {
        return res.status(409).json(apiResponse(null, { code: 'OUTSIDE_SERVICE_HOURS', message: 'Requested time is outside store service hours' }));
      }
      if ((startMinutes - openMinutes) % policy.slotMinutes !== 0) {
        return res.status(409).json(apiResponse(null, { code: 'INVALID_SLOT_ALIGNMENT', message: `Appointments must start on ${policy.slotMinutes}-minute boundaries` }));
      }
  
      const normalizedCustomerEmail = normalizeEmail(customer_email) || normalizeEmail(req.user?.email);
      const selectedServiceId = String(store_service_id || '').trim() || null;
      let pricingMode = 'fixed';
      let depositRequiredAmount = 0;
      if (selectedServiceId) {
        const selectedService = db.prepare(`
          SELECT id, store_id, service_type, name, price_on_assessment, is_active
          FROM store_services
          WHERE id = ? AND store_id = ? AND is_active = 1
          LIMIT 1
        `).get(selectedServiceId, createStoreId);
        if (!selectedService) {
          return res.status(400).json(apiResponse(null, { code: 'INVALID_STORE_SERVICE', message: 'Selected service is unavailable for this store' }));
        }
        if (String(selectedService.service_type || '').trim() !== normalizedServiceType) {
          return res.status(400).json(apiResponse(null, { code: 'INVALID_STORE_SERVICE', message: 'Selected service does not match service_type' }));
        }
        if (Number(selectedService.price_on_assessment || 0) === 1) {
          pricingMode = 'price_on_assessment';
          depositRequiredAmount = getAssessmentDepositAmount(createStoreId, normalizedServiceType);
        }
      }
      const payDepositNow = !!req.body?.pay_deposit_now;
      const payDepositPaymentId = String(req.body?.pay_deposit_payment_id || '').trim() || null;
      let depositPaymentRecord = null;
      if (!isStaff(req.user) && pricingMode === 'price_on_assessment' && depositRequiredAmount > 0 && !payDepositPaymentId) {
        return res.status(409).json(apiResponse(null, {
          code: 'DEPOSIT_PAYMENT_REQUIRED',
          message: 'A successful deposit payment is required to confirm this appointment',
        }));
      }
      if (!isStaff(req.user) && pricingMode === 'price_on_assessment' && depositRequiredAmount > 0) {
        depositPaymentRecord = db.prepare(`
          SELECT *
          FROM appointment_deposit_payments
          WHERE id = ?
            AND user_id = ?
            AND status = 'succeeded'
            AND used_for_appointment_id IS NULL
          LIMIT 1
        `).get(payDepositPaymentId, req.user.id);
        if (!depositPaymentRecord) {
          return res.status(409).json(apiResponse(null, {
            code: 'INVALID_DEPOSIT_PAYMENT',
            message: 'Deposit payment is missing, invalid, or already used.',
          }));
        }
        const paidAmount = Number(depositPaymentRecord.amount || 0);
        const sameStore = !depositPaymentRecord.store_id || String(depositPaymentRecord.store_id) === String(createStoreId);
        const sameService = !depositPaymentRecord.service_type || String(depositPaymentRecord.service_type) === String(normalizedServiceType);
        if (!sameStore || !sameService || paidAmount + 0.0001 < Number(depositRequiredAmount)) {
          return res.status(409).json(apiResponse(null, {
            code: 'DEPOSIT_PAYMENT_MISMATCH',
            message: 'Deposit payment does not match selected store/service or required amount.',
          }));
        }
      }

      const id = uuidv4();
      // Customer self-bookings should appear as confirmed immediately in app UI.
      // Staff-created bookings keep pending workflow for front-desk triage.
      const initialStatus = isStaff(req.user) ? 'pending' : 'confirmed';
      db.prepare('BEGIN IMMEDIATE').run();
      try {
        const overlapCount = countOverlappingAppointments({
          date: parsedDate,
          startMinutes,
          durationMinutes: requestedDuration,
          storeId: createStoreId,
          serviceType: normalizedServiceType,
        });
        if (overlapCount >= policy.maxConcurrent) {
          const slotErr = new Error('Requested slot is fully booked');
          slotErr.status = 409;
          slotErr.code = 'SLOT_UNAVAILABLE';
          throw slotErr;
        }
  
        if (!isStaff(req.user)) {
          const limitErr = validateCustomerBookingLimits({
            userId: req.user.id,
            storeId: createStoreId,
            date: parsedDate,
            time: parsedTime,
          });
          if (limitErr) {
            const err = new Error(limitErr.message);
            err.status = limitErr.status;
            err.code = limitErr.code;
            throw err;
          }
        }
  
        insertAppointment.run(
          id,
          req.user.id,
          dog_id || null,
          dog_name,
          customer_name || null,
          customer_phone || null,
          normalizedCustomerEmail,
          normalizedServiceType,
          parsedDate,
          parsedTime,
          requestedDuration,
          initialStatus,
          notes || null,
          booked_via || 'form',
          createStoreId
        );
        db.prepare(`
          UPDATE appointments
          SET store_service_id = ?, pricing_mode = ?, deposit_required_amount = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(selectedServiceId, pricingMode, depositRequiredAmount, id);
        const shouldInsertDepositRow = pricingMode === 'price_on_assessment'
          && depositRequiredAmount > 0
          && ((isStaff(req.user) && payDepositNow) || !!depositPaymentRecord);
        if (shouldInsertDepositRow) {
          const depositId = `dep-${uuidv4().slice(0, 10)}`;
          const paidAmount = depositPaymentRecord
            ? Math.round(Number(depositPaymentRecord.amount || depositRequiredAmount) * 100) / 100
            : Math.round(depositRequiredAmount * 100) / 100;
          db.prepare(`
            INSERT INTO appointment_deposits
            (id, appointment_id, user_id, amount, status, note, created_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'charged', ?, ?, datetime('now'), datetime('now'))
          `).run(
            depositId,
            id,
            req.user.id,
            paidAmount,
            depositPaymentRecord ? `deposit_paid_via_square:${depositPaymentRecord.provider_payment_id || 'unknown'}` : 'deposit_paid_at_booking',
            req.user.id
          );
          if (depositPaymentRecord) {
            const consumed = db.prepare(`
              UPDATE appointment_deposit_payments
              SET used_for_appointment_id = ?, updated_at = datetime('now')
              WHERE id = ? AND used_for_appointment_id IS NULL
            `).run(id, depositPaymentRecord.id);
            if (!Number(consumed?.changes || 0)) {
              const consumeErr = new Error('Deposit payment was already consumed');
              consumeErr.status = 409;
              consumeErr.code = 'DEPOSIT_PAYMENT_ALREADY_USED';
              throw consumeErr;
            }
          }
        }
        db.prepare('COMMIT').run();
      } catch (err) {
        db.prepare('ROLLBACK').run();
        throw err;
      }
  
      const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
      const depositPaid = getAppointmentDepositPaidTotal(id);
      sendNotification(req.user.id, 'appointment_created', {
        appointment_id: appt.id,
        date: appt.date,
        time: appt.time,
        service_type: appt.service_type,
        status: appt.status,
      }).catch(() => {});
      const emailSentTo = await sendAppointmentLifecycleEmail(req, 'created', appt);
      res.status(201).json(apiResponse({
        ...appt,
        deposit_paid_total: depositPaid,
        is_deposit_paid: depositPaid > 0,
        email_sent_to: emailSentTo,
      }));
    } catch (err) {
      const status = Number(err?.status) || 500;
      const code = err?.code || 'SERVER_ERROR';
      res.status(status).json(apiResponse(null, { code, message: err.message }));
    }
  });
  
  // POST /api/v1/appointments/:id/charge - Staff checkout for service charges
  app.post('/api/v1/appointments/:id/charge', roleGuard('admin', 'store_manager', 'staff'), (req, res) => {
    try {
      const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
      if (!appt) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Appointment not found' }));
      }
      if (!canAccessStoreScopedRecord(req, appt.store_id, { includeNullFallback: true })) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
      }
      if (appt.status === 'cancelled') {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_STATE', message: 'Cannot charge a cancelled appointment' }));
      }
      const existingCharge = db.prepare('SELECT * FROM appointment_charges WHERE appointment_id = ? AND status = ?').get(req.params.id, 'charged');
      if (existingCharge) {
        return res.status(409).json(apiResponse(null, { code: 'ALREADY_CHARGED', message: 'Appointment has already been charged' }));
      }
      const depositPaid = getAppointmentDepositPaidTotal(appt.id);
      const depositRequiredAmount = Math.round(Number(appt.deposit_required_amount || 0) * 100) / 100;
      if (depositRequiredAmount > 0 && depositPaid <= 0) {
        return res.status(409).json(apiResponse(null, {
          code: 'DEPOSIT_REQUIRED',
          message: 'Deposit must be collected before final appointment charge',
        }));
      }
  
      const serviceType = appt.service_type || 'other';
      const scopedPriceRaw = Number(getSetting(`service_price_${serviceType}`, '0', appt.store_id || null));
      const row = db.prepare('SELECT * FROM service_prices WHERE service_type = ? AND is_active = 1').get(serviceType);
      const fallbackPrice = Number(req.body?.base_price);
      const basePrice = Number.isFinite(scopedPriceRaw) && scopedPriceRaw > 0
        ? scopedPriceRaw
        : (row ? Number(row.base_price) : (Number.isNaN(fallbackPrice) ? 0 : fallbackPrice));
      if (basePrice <= 0) {
        return res.status(400).json(apiResponse(null, { code: 'VALIDATION', message: 'No valid service price found' }));
      }
  
      const businessCode = req.body?.business_code || null;
      const linkOrBm = appt.user_id ? getBusinessMemberForCustomer(appt.user_id, businessCode) : null;
      const discount = computeDiscount(basePrice, linkOrBm, appt.user_id || null);
      const businessMembershipId = discount.business_membership_id;
      if (depositPaid > discount.final_total) {
        return res.status(400).json(apiResponse(null, {
          code: 'DEPOSIT_EXCEEDS_FINAL_PRICE',
          message: 'Deposit exceeds final price. Adjust final price before charging.',
        }));
      }
  
      let pointsAwarded = 0;
      if (businessMembershipId && appt.user_id) {
        const bm = db.prepare('SELECT * FROM business_memberships WHERE id = ?').get(businessMembershipId);
        if (bm) {
          const isSelf = bm.user_id === appt.user_id;
          pointsAwarded = computePoints(
            discount.final_total,
            isSelf ? bm.points_multiplier_self : bm.points_multiplier_referral
          );
        }
      }
  
      const chargeId = `charge-${uuidv4().slice(0, 8)}`;
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO appointment_charges
          (id, appointment_id, user_id, business_membership_id, service_type, base_price, discount_amount, final_price, points_awarded, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'charged', datetime('now'), datetime('now'))
        `).run(
          chargeId,
          appt.id,
          appt.user_id || null,
          businessMembershipId || null,
          serviceType,
          discount.subtotal,
          discount.discount_amount,
          discount.final_total,
          pointsAwarded
        );
  
        if (businessMembershipId && pointsAwarded > 0) {
          const bm = db.prepare('SELECT * FROM business_memberships WHERE id = ?').get(businessMembershipId);
          const isSelf = bm && bm.user_id === appt.user_id;
          awardBusinessMemberPoints({
            businessMembershipId,
            customerUserId: appt.user_id || null,
            appointmentChargeId: chargeId,
            sourceType: isSelf ? 'self_service_charge' : 'referred_service_charge',
            points: pointsAwarded,
            memo: `appointment ${appt.id}`,
          });
        }
      });
      tx();
  
      const charge = db.prepare('SELECT * FROM appointment_charges WHERE id = ?').get(chargeId);
      res.status(201).json(apiResponse({
        ...charge,
        deposit_paid: depositPaid,
        amount_due_now: Math.round((discount.final_total - depositPaid) * 100) / 100,
        discount_breakdown: discount,
      }));
    } catch (err) {
      console.error('Appointment charge error:', err);
      res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });
  
  // PUT /api/v1/appointments/:id - Update appointment (staff can update any, customers their own)
  app.put('/api/v1/appointments/:id', async (req, res) => {
    try {
      const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
      if (!existing) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Appointment not found' }));
      }
      if (!canAccessStoreScopedRecord(req, existing.store_id, { includeNullFallback: true })) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
      }
      if (!isStaff(req.user) && existing.user_id !== req.user.id) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
      }
  
      // Customers can only update limited fields; staff can update all
      const staffFields = ['dog_id', 'dog_name', 'customer_name', 'customer_phone', 'customer_email', 'service_type', 'date', 'time', 'duration_minutes', 'status', 'notes'];
      const customerFields = ['dog_name', 'customer_name', 'customer_phone', 'customer_email', 'service_type', 'date', 'time', 'duration_minutes', 'notes'];
      const fields = isStaff(req.user) ? staffFields : customerFields;
      const updates = [];
      const params = [];

      fields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          params.push(req.body[field]);
        }
      });

      const emailIdx = updates.findIndex((u) => u.startsWith('customer_email'));
      if (emailIdx !== -1) {
        params[emailIdx] = normalizeEmail(params[emailIdx]);
      }

      if (updates.length === 0) {
        return res.json(apiResponse(existing));
      }

      // Determine effective scheduling values (body overrides fall back to existing)
      const effDate = req.body.date !== undefined ? String(req.body.date).trim() : existing.date;
      const effTime = req.body.time !== undefined ? String(req.body.time).trim() : existing.time;
      const effServiceRaw = req.body.service_type !== undefined ? req.body.service_type : existing.service_type;
      const effDuration = req.body.duration_minutes !== undefined ? Number(req.body.duration_minutes) : (existing.duration_minutes || 60);
      const schedulingChanged = effDate !== existing.date || effTime !== existing.time
        || effServiceRaw !== existing.service_type || effDuration !== (existing.duration_minutes || 60);

      // Validate scheduling fields when they change
      if (schedulingChanged) {
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(effDate);
        const startMinutes = parseMinutes(effTime);
        if (!validDate || startMinutes == null) {
          return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'date or time format is invalid' }));
        }
        const normalizedServiceType = normalizeAppointmentServiceType(effServiceRaw);
        if (!normalizedServiceType) {
          return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'service_type is invalid' }));
        }
        if (!Number.isInteger(effDuration) || effDuration <= 0 || effDuration > 240) {
          return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'duration_minutes must be between 1 and 240' }));
        }

        const storeId = existing.store_id;
        const policy = getServicePolicy(storeId, normalizedServiceType);
        if (!policy.serviceEnabled) {
          return res.status(409).json(apiResponse(null, { code: 'SERVICE_DISABLED', message: `${normalizedServiceType} is not available for this store` }));
        }
        const openMinutes = policy.storeOpen * 60;
        const closeMinutes = policy.storeClose * 60;
        if (startMinutes < openMinutes || (startMinutes + effDuration) > closeMinutes) {
          return res.status(409).json(apiResponse(null, { code: 'OUTSIDE_SERVICE_HOURS', message: 'Requested time is outside store service hours' }));
        }
        if ((startMinutes - openMinutes) % policy.slotMinutes !== 0) {
          return res.status(409).json(apiResponse(null, { code: 'INVALID_SLOT_ALIGNMENT', message: `Appointments must start on ${policy.slotMinutes}-minute boundaries` }));
        }

        // Ensure the normalized service_type is stored
        const stIdx = updates.findIndex(u => u.startsWith('service_type'));
        if (stIdx !== -1) params[stIdx] = normalizedServiceType;

        // Check slot availability (exclude the appointment being updated)
        const overlapParams = [effDate, normalizedServiceType, req.params.id];
        let overlapSql = `SELECT time, duration_minutes FROM appointments
          WHERE date = ? AND service_type = ? AND id != ?
          AND status IN ${APPOINTMENT_ACTIVE_STATUSES_SQL}`;
        overlapSql += buildStoreScopedWhere('store_id', storeId, overlapParams);
        const bookedRows = db.prepare(overlapSql).all(...overlapParams);
        const overlapCount = bookedRows.filter((row) => {
          const bStart = parseMinutes(String(row.time || ''));
          if (bStart == null) return false;
          const bEnd = bStart + (Number(row.duration_minutes) || 60);
          return startMinutes < bEnd && (startMinutes + effDuration) > bStart;
        }).length;
        if (overlapCount >= policy.maxConcurrent) {
          return res.status(409).json(apiResponse(null, { code: 'SLOT_UNAVAILABLE', message: 'Requested slot is fully booked' }));
        }
      } else if (req.body.service_type !== undefined) {
        // Even if scheduling didn't change, validate service_type value
        if (!normalizeAppointmentServiceType(req.body.service_type)) {
          return res.status(400).json(apiResponse(null, { code: 'INVALID_REQUEST', message: 'service_type is invalid' }));
        }
      }

      updates.push("updated_at = datetime('now')");
      params.push(req.params.id);

      db.prepare(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
      sendNotification(updated.user_id, 'appointment_updated', {
        appointment_id: updated.id,
        date: updated.date,
        time: updated.time,
        service_type: updated.service_type,
        status: updated.status,
      }).catch(() => {});
      let emailSentTo = null;
      if (updated.status === 'cancelled' && existing.status !== 'cancelled') {
        emailSentTo = await sendAppointmentLifecycleEmail(req, 'cancelled', updated);
      } else if (schedulingChanged) {
        emailSentTo = await sendAppointmentLifecycleEmail(req, 'rescheduled', updated, {
          oldDate: existing.date,
          oldTime: existing.time,
        });
      }
      res.json(apiResponse({
        ...updated,
        email_sent_to: emailSentTo,
      }));
    } catch (err) {
      const status = Number(err?.status) || 500;
      const code = err?.code || 'SERVER_ERROR';
      res.status(status).json(apiResponse(null, { code, message: err.message }));
    }
  });
  
  // DELETE /api/v1/appointments/:id - Cancel appointment (staff can cancel any, customers their own)
  app.delete('/api/v1/appointments/:id', async (req, res) => {
    const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Appointment not found' }));
    }
    if (!canAccessStoreScopedRecord(req, existing.store_id, { includeNullFallback: true })) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
    }
    if (!isStaff(req.user) && existing.user_id !== req.user.id) {
      return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Access denied' }));
    }
  
    db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    sendNotification(existing.user_id, 'appointment_cancelled', {
      appointment_id: existing.id,
      date: existing.date,
      time: existing.time,
      service_type: existing.service_type,
      status: 'cancelled',
    }).catch(() => {});
    const cancelled = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    const emailSentTo = cancelled ? await sendAppointmentLifecycleEmail(req, 'cancelled', cancelled) : null;
    res.json(apiResponse({ cancelled: true, id: req.params.id, email_sent_to: emailSentTo }));
  });

  // POST /api/v1/appointments/:id/deposit - Staff collects deposit for assessment-priced services
  app.post('/api/v1/appointments/:id/deposit', roleGuard('admin', 'store_manager', 'staff'), (req, res) => {
    try {
      const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
      if (!appt) {
        return res.status(404).json(apiResponse(null, { code: 'NOT_FOUND', message: 'Appointment not found' }));
      }
      if (!canAccessStoreScopedRecord(req, appt.store_id, { includeNullFallback: true })) {
        return res.status(403).json(apiResponse(null, { code: 'FORBIDDEN', message: 'Store access denied' }));
      }
      if (appt.status === 'cancelled') {
        return res.status(400).json(apiResponse(null, { code: 'INVALID_STATE', message: 'Cannot collect deposit for a cancelled appointment' }));
      }
      if (String(appt.pricing_mode || 'fixed') !== 'price_on_assessment' || Number(appt.deposit_required_amount || 0) <= 0) {
        return res.status(400).json(apiResponse(null, {
          code: 'DEPOSIT_NOT_APPLICABLE',
          message: 'Deposit is only applicable to price-on-assessment appointments',
        }));
      }
      const alreadyCharged = db.prepare(
        "SELECT 1 FROM appointment_charges WHERE appointment_id = ? AND status = 'charged' LIMIT 1"
      ).get(appt.id);
      if (alreadyCharged) {
        return res.status(409).json(apiResponse(null, {
          code: 'ALREADY_CHARGED',
          message: 'Final charge already completed. Deposit cannot be collected now.',
        }));
      }
      const existingDeposit = db.prepare(
        "SELECT * FROM appointment_deposits WHERE appointment_id = ? AND status = 'charged' ORDER BY created_at DESC LIMIT 1"
      ).get(appt.id);
      if (existingDeposit) {
        return res.status(409).json(apiResponse(null, {
          code: 'ALREADY_DEPOSIT_COLLECTED',
          message: 'A deposit has already been collected for this appointment',
        }));
      }

      const requested = Number(req.body?.amount);
      const fallback = Number(appt.deposit_required_amount || 0);
      const amount = Number.isFinite(requested) && requested > 0 ? requested : fallback;
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json(apiResponse(null, {
          code: 'VALIDATION',
          message: 'Deposit amount must be a positive number',
        }));
      }

      const depositId = `dep-${uuidv4().slice(0, 10)}`;
      db.prepare(`
        INSERT INTO appointment_deposits
        (id, appointment_id, user_id, amount, status, note, created_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'charged', ?, ?, datetime('now'), datetime('now'))
      `).run(
        depositId,
        appt.id,
        appt.user_id || null,
        Math.round(amount * 100) / 100,
        String(req.body?.note || '').trim() || null,
        req.user?.id || null
      );
      const deposit = db.prepare('SELECT * FROM appointment_deposits WHERE id = ?').get(depositId);
      return res.status(201).json(apiResponse({
        ...deposit,
        deposit_paid_total: getAppointmentDepositPaidTotal(appt.id),
      }));
    } catch (err) {
      console.error('Appointment deposit error:', err);
      return res.status(500).json(apiResponse(null, { code: 'DB_ERROR', message: err.message }));
    }
  });
  
  /**
   * LLM-powered voice booking parser.
   * Uses the first available LLM provider to extract structured booking data.
   */
  async function parseVoiceBookingLLM(text, availableProviders, requestKeys = {}) {
    const today = new Date();
    const toLocalDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = toLocalDateStr(today);
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  
    const systemPrompt = `You are a booking assistant for a classic car store. Extract appointment details from the user's natural language input.
  
  Today is ${dayName}, ${todayStr}.
  
  Valid service types: wash, groom, nail_trim, full_service
  - "wash" or "bath" â†’ wash
  - "groom" or "grooming" â†’ groom
  - "nail" or "nail trim" â†’ nail_trim
  - "full service" or "full groom" â†’ full_service
  
  Return ONLY a JSON object with these fields (use null for anything you cannot determine):
  {
    "dog_name": string or null,
    "service_type": "wash" | "groom" | "nail_trim" | "full_service" | null,
    "date": "YYYY-MM-DD" or null,
    "time": "HH:MM" (24-hour) or null,
    "store_name": string or null,
    "customer_name": string or null,
    "customer_phone": string or null,
    "notes": string or null
  }
  
  Rules:
  - If a date like "16th" is mentioned without a month, assume the current or next month (whichever is in the future).
  - "day after tomorrow" means 2 days from today.
  - Convert relative dates (today, tomorrow, Friday, etc.) to absolute YYYY-MM-DD.
  - Convert times to 24-hour format (e.g., "11 a.m." â†’ "11:00", "3pm" â†’ "15:00").
  - Extract the person's name if they say "my name is..." or "I'm...".
  - Extract phone numbers in any format.
  - Extract any special requests, notes, or comments (e.g., "please note...", "I may be late", etc.) into the notes field.
  - If a store or location name is mentioned (e.g., "at UnforgettableRides Downtown", "Allviews store"), extract it into store_name.
  - Do NOT include any text outside the JSON object.`;
  
    const messages = [{ role: 'user', content: text }];
  
    let llmResponse = null;
    let usedProvider = null;
    for (const provider of availableProviders) {
      try {
        const config = LLM_PROVIDERS[provider];
        const model = getProviderModel(provider);
        const effectiveKey = getEffectiveKey(provider, requestKeys);
        llmResponse = await config.call(systemPrompt, messages, model, effectiveKey);
        usedProvider = provider;
        break;
      } catch {
        continue;
      }
    }
  
    if (!llmResponse) {
      throw new Error('All LLM providers failed');
    }
  
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM did not return valid JSON');
    }
  
    const parsed = JSON.parse(jsonMatch[0]);
    const data = {
      dog_name: parsed.dog_name || undefined,
      service_type: parsed.service_type || undefined,
      date: parsed.date || undefined,
      time: parsed.time || undefined,
      store_name: parsed.store_name || undefined,
      customer_name: parsed.customer_name || undefined,
      customer_phone: parsed.customer_phone || undefined,
      notes: parsed.notes || undefined,
      booked_via: 'voice',
    };
  
    const missing_fields = [];
    if (!data.dog_name) missing_fields.push('dog_name');
    if (!data.service_type) missing_fields.push('service_type');
    if (!data.date) missing_fields.push('date');
    if (!data.time) missing_fields.push('time');
  
    const confidence = Math.min(1.0, 0.5 + (4 - missing_fields.length) * 0.15);
  
    return {
      parsed: true,
      confidence,
      data,
      original_text: text,
      missing_fields,
      _provider: usedProvider,
    };
  }
  
  /**
   * Simple regex-based voice booking parser (fallback when no LLM is available).
   * Extracts service type, dog name, date, and time from natural language.
   */
  function parseVoiceBooking(text) {
    const lower = text.toLowerCase();
    const result = { parsed: true, confidence: 0.5, data: {}, original_text: text, missing_fields: [] };
  
    // Extract service type
    const servicePatterns = [
      { pattern: /\b(full service|full groom)\b/, type: 'full_service' },
      { pattern: /\b(groom|grooming)\b/, type: 'groom' },
      { pattern: /\b(nail|nails|nail trim)\b/, type: 'nail_trim' },
      { pattern: /\b(wash|bath|bathe)\b/, type: 'wash' },
    ];
    for (const sp of servicePatterns) {
      if (sp.pattern.test(lower)) {
        result.data.service_type = sp.type;
        result.confidence += 0.1;
        break;
      }
    }
    if (!result.data.service_type) result.missing_fields.push('service_type');
  
    // Extract dog name â€” look for "for <Name>" pattern
    const nameMatch = lower.match(/\bfor\s+([a-z]+)\b/);
    if (nameMatch) {
      result.data.dog_name = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
      result.confidence += 0.15;
    } else {
      result.missing_fields.push('dog_name');
    }
  
    // Extract time â€” supports "at 5pm", "5 PM", "5:30pm", "at 10:00 am", "and 5 PM"
    const timeMatch = lower.match(/(?:\bat\b|&|and)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] || '00';
      const ampm = timeMatch[3].replace(/\./g, '');
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      result.data.time = `${String(hour).padStart(2, '0')}:${minutes}`;
      result.confidence += 0.15;
    } else {
      result.missing_fields.push('time');
    }
  
    // Extract date
    // Use local date formatting to avoid UTC timezone shift at night
    const today = new Date();
    const toLocalDateStr = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
  
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const monthShort = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
    if (/\btoday\b/.test(lower)) {
      result.data.date = toLocalDateStr(today);
      result.confidence += 0.1;
    } else if (/\bday after tomorrow\b/.test(lower)) {
      const dat = new Date(today);
      dat.setDate(dat.getDate() + 2);
      result.data.date = toLocalDateStr(dat);
      result.confidence += 0.1;
    } else if (/\btomorrow\b/.test(lower)) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      result.data.date = toLocalDateStr(tomorrow);
      result.confidence += 0.1;
    } else {
      // Try ordinal dates: "16th", "March 16th", "16th of March", "the 16th"
      const ordinalMatch = lower.match(/(?:(?:the|on)\s+)?(\d{1,2})(?:st|nd|rd|th)(?:\s+(?:of\s+)?([a-z]+))?/);
      const monthDayMatch = lower.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/);
  
      let parsedDay = null;
      let parsedMonth = null;
  
      if (ordinalMatch) {
        parsedDay = parseInt(ordinalMatch[1]);
        if (ordinalMatch[2]) {
          const mi = monthNames.indexOf(ordinalMatch[2]);
          const ms = monthShort.indexOf(ordinalMatch[2]);
          if (mi >= 0) parsedMonth = mi;
          else if (ms >= 0) parsedMonth = ms;
        }
      } else if (monthDayMatch) {
        const mi = monthNames.indexOf(monthDayMatch[1]);
        const ms = monthShort.indexOf(monthDayMatch[1]);
        if (mi >= 0 || ms >= 0) {
          parsedMonth = mi >= 0 ? mi : ms;
          parsedDay = parseInt(monthDayMatch[2]);
        }
      }
  
      if (parsedDay !== null && parsedDay >= 1 && parsedDay <= 31) {
        const target = new Date(today);
        if (parsedMonth !== null) {
          target.setMonth(parsedMonth, parsedDay);
          // If the date is in the past, assume next year
          if (target < today) target.setFullYear(target.getFullYear() + 1);
        } else {
          // No month specified â€” assume current or next month
          target.setDate(parsedDay);
          if (target < today) target.setMonth(target.getMonth() + 1);
        }
        result.data.date = toLocalDateStr(target);
        result.confidence += 0.1;
      } else {
        // Try day names: "friday", "this friday"
        for (let i = 0; i < dayNames.length; i++) {
          if (lower.includes(dayNames[i])) {
            const currentDay = today.getDay();
            let daysAhead = i - currentDay;
            if (daysAhead <= 0) daysAhead += 7;
            const target = new Date(today);
            target.setDate(target.getDate() + daysAhead);
            result.data.date = toLocalDateStr(target);
            result.confidence += 0.1;
            break;
          }
        }
      }
    }
    if (!result.data.date) result.missing_fields.push('date');
  
    // Extract customer name â€” "my name is X", "I'm X", "name: X"
    const customerNameMatch = text.match(/(?:my name is|i'm|i am|name[:\s]+)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (customerNameMatch) {
      result.data.customer_name = customerNameMatch[1].trim();
    }
  
    // Extract phone number
    const phoneMatch = text.match(/(\+?1?\s*[-.]?\s*\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4})/);
    if (phoneMatch) {
      result.data.customer_phone = phoneMatch[1].trim();
    }
  
    // Extract notes â€” "please note...", "note that...", "note:..."
    const noteMatch = text.match(/(?:please\s+note\s+(?:that\s+)?|note[:\s]+)(.+?)(?:\.|$)/i);
    if (noteMatch) {
      result.data.notes = noteMatch[1].trim();
    }
  
    result.data.booked_via = 'voice';
    result.confidence = Math.min(1.0, result.confidence);
  
    return result;
  }
}

module.exports = {
  registerAppointmentsRoutes,
};

