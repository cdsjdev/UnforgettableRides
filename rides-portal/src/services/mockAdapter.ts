// ─────────────────────────────────────────────────────────────────────────
// STATIC DEMO MOCK ADAPTER
//
// This file makes the portal run with NO backend, for the read-only
// "show and tell" demo deployed to GitHub Pages (unforgettablerides.com).
//
// It is activated ONLY when VITE_STATIC_DEMO === 'true' (see api.ts). On the
// real backend build this file is never wired in, so production is unaffected.
//
// It swaps axios's transport (`adapter`) for a function that pattern-matches
// the request URL and returns realistic canned data in the app's standard
// `{ success, data }` envelope. Every page renders as if signed in as a demo
// user; write actions (book / message / edit) resolve successfully but change
// nothing.
// ─────────────────────────────────────────────────────────────────────────
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import mockCars from './mock-cars.json';

const nowIso = new Date().toISOString();

export const DEMO_USER = {
  id: 'demo-user-1',
  email: 'demo@unforgettablerides.com',
  name: 'Demo Guest',
  role: 'customer' as const,
  phone_number: null,
  avatar_url: null,
  store_id: null,
  email_verified_at: nowIso,
  is_active: true,
  created_at: nowIso,
  updated_at: nowIso,
};

export const DEMO_TOKEN = 'demo-static-token';

const cars = mockCars as any[];

const demoBookings = [
  {
    id: 'booking-1',
    car_id: 'car-4',
    car: cars.find((c) => c.id === 'car-4'),
    customer_id: DEMO_USER.id,
    customer: { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email },
    status: 'confirmed',
    start_time: '2026-08-14T13:00:00.000Z',
    end_time: '2026-08-14T18:00:00.000Z',
    total_cents: 125000,
    created_at: nowIso,
    updated_at: nowIso,
  },
  {
    id: 'booking-2',
    car_id: 'car-1',
    car: cars.find((c) => c.id === 'car-1'),
    customer_id: DEMO_USER.id,
    customer: { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email },
    status: 'pending',
    start_time: '2026-09-02T10:00:00.000Z',
    end_time: '2026-09-02T16:00:00.000Z',
    total_cents: 95000,
    created_at: nowIso,
    updated_at: nowIso,
  },
];

const ok = <T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse => ({
  data: { success: true, data },
  status,
  statusText: 'OK',
  headers: {},
  config,
});

// Build a synthetic thread/message set for the messaging pages
const demoThreads = {
  items: [
    {
      id: 'thread-1',
      participants: [
        { id: DEMO_USER.id, name: DEMO_USER.name, avatar_url: null },
        { id: 'owner-1', name: 'Heritage Motors', avatar_url: null },
      ],
      last_message: { id: 'm-2', body: 'Wonderful — the DB5 will be ready for you.', created_at: nowIso, sender_id: 'owner-1' },
      unread_count: 0,
      updated_at: nowIso,
    },
  ],
  next_cursor: null,
  has_more: false,
};

const demoMessages = {
  items: [
    { id: 'm-1', thread_id: 'thread-1', sender_id: DEMO_USER.id, body: 'Hi! Is the Aston Martin DB5 available on August 14th?', created_at: nowIso },
    { id: 'm-2', thread_id: 'thread-1', sender_id: 'owner-1', body: 'Wonderful — the DB5 will be ready for you.', created_at: nowIso },
  ],
  next_cursor: null,
  has_more: false,
};

/** Resolve a request to canned data. Returns undefined if unmatched. */
function resolve(method: string, url: string, body: any): unknown {
  const m = method.toUpperCase();
  const path = url.replace(/^\/?(api\/v1)?\/?/, '/').replace(/\/+/g, '/');

  // ── Auth ──────────────────────────────────────────────
  if (path === '/auth/me') return DEMO_USER;
  if (path === '/auth/login' || path === '/auth/signup') return { token: DEMO_TOKEN, user: DEMO_USER };
  if (path === '/auth/login/verify-device') return { token: DEMO_TOKEN, user: DEMO_USER };
  if (path === '/auth/password/forgot') return { message: 'If this email is registered, a reset link has been sent.' };
  if (path === '/auth/password/reset') return { message: 'Password reset successfully.' };
  if (path === '/auth/email/send-verification') return { already_verified: true };
  if (path === '/auth/email/verify') return { verified: true, email_verified_at: nowIso, user: DEMO_USER };
  if (path === '/auth/role/become-owner') return { ...DEMO_USER, role: 'owner' };
  if (path === '/auth/profile') return { ...DEMO_USER, ...(body || {}) };
  if (path === '/upload') return { url: cars[0].primary_image_url };

  // ── Cars ──────────────────────────────────────────────
  if (path === '/cars/featured') return cars.slice(0, 6);
  if (path === '/cars' && m === 'GET') return { items: cars, total: cars.length };
  if (path === '/cars' && m === 'POST') return { ...cars[0], id: 'car-new', ...(body || {}) };
  const carId = path.match(/^\/cars\/([^/]+)$/)?.[1];
  if (carId) {
    const car = cars.find((c) => c.id === carId) || cars[0];
    return { ...car, reviews: [] };
  }
  if (/^\/cars\/[^/]+\/availability$/.test(path)) return m === 'GET' ? { blocked_dates: [] } : {};
  if (/^\/cars\/[^/]+\/images/.test(path)) return { id: 'img-new', url: cars[0].primary_image_url };
  if (/^\/cars\/[^/]+\/reviews$/.test(path)) return { id: 'rev-new', rating: 5, comment: '', created_at: nowIso };

  // ── Bookings ──────────────────────────────────────────
  if (path === '/bookings' && m === 'GET') return demoBookings;
  if (path === '/bookings' && m === 'POST') return { ...demoBookings[0], id: 'booking-new', status: 'pending' };
  const bId = path.match(/^\/bookings\/([^/]+)/)?.[1];
  if (bId) return demoBookings.find((b) => b.id === bId) || demoBookings[0];

  // ── Quotes ────────────────────────────────────────────
  if (path === '/quotes' && m === 'GET') return [];
  if (path === '/quotes') return { id: 'quote-new', status: 'pending', created_at: nowIso };

  // ── Messaging ─────────────────────────────────────────
  if (path === '/social/threads/unread-count') return { unread_count: 0 };
  if (path === '/social/threads' && m === 'GET') return demoThreads;
  if (path === '/social/threads' && m === 'POST') return { threadId: 'thread-1', created: false };
  if (/^\/social\/threads\/[^/]+\/messages$/.test(path)) {
    if (m === 'POST') return { id: 'm-new', thread_id: 'thread-1', sender_id: DEMO_USER.id, body: body?.body || '', created_at: nowIso };
    return demoMessages;
  }
  if (/^\/social\/threads\/[^/]+\/read$/.test(path)) return {};

  return undefined;
}

export const mockAdapter: AxiosAdapter = (config) =>
  new Promise((resolvePromise, reject) => {
    const method = config.method || 'get';
    const url = config.url || '';
    let body: any = config.data;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* keep raw */ } }

    const data = resolve(method, url, body);

    // Simulate a little latency so skeletons/spinners show naturally
    setTimeout(() => {
      if (data === undefined) {
        // Unmatched endpoint: fail softly with an empty-success shape so pages
        // degrade to empty states rather than throwing.
        resolvePromise(ok(config, null));
        return;
      }
      resolvePromise(ok(config, data));
    }, 180);
  });
