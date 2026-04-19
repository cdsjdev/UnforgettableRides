import axios from 'axios';
import type {
  User,
  LoginResponse,
  APIResponse,
  FeedbackItem,
  ClassicCar,
  Booking,
  Quote,
  Payout,
} from '@shared/types';

export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rides_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('rides_token')) {
      localStorage.removeItem('rides_token');
      localStorage.removeItem('rides_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// Auth
// ============================================================================

export const authAPI = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post<APIResponse<LoginResponse>>('/auth/login', { email, password });
    return data.data!;
  },

  verifyDeviceLogin: async (challenge_id: string, code: string): Promise<LoginResponse> => {
    const { data } = await api.post<APIResponse<LoginResponse>>('/auth/login/verify-device', { challenge_id, code });
    return data.data!;
  },

  register: async (user: { email: string; password: string; name: string; role?: string }): Promise<User> => {
    const { data } = await api.post<APIResponse<User>>('/auth/register', user);
    return data.data!;
  },

  me: async (): Promise<User> => {
    const { data } = await api.get<APIResponse<User>>('/auth/me');
    return data.data!;
  },

  changePassword: async (current_password: string, new_password: string): Promise<void> => {
    await api.put('/auth/password', { current_password, new_password });
  },

  verifyPassword: async (current_password: string): Promise<{ verified: boolean }> => {
    const { data } = await api.post<APIResponse<{ verified: boolean }>>('/auth/verify-password', { current_password });
    return data.data!;
  },

  forgotPassword: async (email: string): Promise<void> => {
    await api.post('/auth/password/forgot', { email, client: 'dashboard' });
  },

  resetPassword: async (token: string, new_password: string): Promise<void> => {
    await api.post('/auth/password/reset', { token, new_password });
  },

  getUsers: async (): Promise<User[]> => {
    const { data } = await api.get<APIResponse<User[]>>('/users');
    return data.data!;
  },

  updateUser: async (id: string, updates: Partial<User>): Promise<User> => {
    const { data } = await api.put<APIResponse<User>>(`/users/${id}`, updates);
    return data.data!;
  },
};

// ============================================================================
// Cars (Admin)
// ============================================================================

export const carsAdminAPI = {
  getAll: async (params?: { owner_id?: string; is_active?: boolean; available_for_hire?: boolean }): Promise<ClassicCar[]> => {
    const { data } = await api.get<APIResponse<any>>('/cars', { params });
    const payload = data.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  },

  getById: async (id: string): Promise<ClassicCar> => {
    const { data } = await api.get<APIResponse<ClassicCar>>(`/cars/${id}`);
    return data.data!;
  },

  update: async (id: string, updates: Partial<ClassicCar>): Promise<ClassicCar> => {
    const { data } = await api.put<APIResponse<ClassicCar>>(`/cars/${id}`, updates);
    return data.data!;
  },

  deactivate: async (id: string): Promise<void> => {
    await api.delete(`/cars/${id}`);
  },
};

// ============================================================================
// Bookings (Admin)
// ============================================================================

export const bookingsAdminAPI = {
  getAll: async (params?: { status?: string; event_date?: string }): Promise<Booking[]> => {
    const { data } = await api.get<APIResponse<Booking[]>>('/bookings', { params });
    return data.data || [];
  },

  getById: async (id: string): Promise<Booking> => {
    const { data } = await api.get<APIResponse<Booking>>(`/bookings/${id}`);
    return data.data!;
  },

  updateStatus: async (id: string, status: string, reason?: string): Promise<Booking> => {
    const { data } = await api.patch<APIResponse<Booking>>(`/bookings/${id}/status`, { status, reason });
    return data.data!;
  },
};

// ============================================================================
// Quotes (Admin)
// ============================================================================

export const quotesAdminAPI = {
  getAll: async (params?: { status?: string }): Promise<Quote[]> => {
    const { data } = await api.get<APIResponse<Quote[]>>('/quotes', { params });
    return data.data || [];
  },

  updateStatus: async (id: string, status: string): Promise<Quote> => {
    const { data } = await api.patch<APIResponse<Quote>>(`/quotes/${id}/status`, { status });
    return data.data!;
  },
};

// ============================================================================
// Payouts (Admin)
// ============================================================================

export const payoutsAdminAPI = {
  getAll: async (params?: { status?: string; owner_id?: string }): Promise<Payout[]> => {
    const { data } = await api.get<APIResponse<Payout[]>>('/payouts', { params });
    return data.data || [];
  },

  create: async (payload: { owner_id: string; amount_cents: number; notes?: string }): Promise<Payout> => {
    const { data } = await api.post<APIResponse<Payout>>('/payouts', payload);
    return data.data!;
  },

  updateStatus: async (id: string, status: string): Promise<Payout> => {
    const { data } = await api.patch<APIResponse<Payout>>(`/payouts/${id}/status`, { status });
    return data.data!;
  },
};

// ============================================================================
// Settings
// ============================================================================

export const settingsAPI = {
  get: async (): Promise<Record<string, string>> => {
    const { data } = await api.get<APIResponse<Record<string, string>>>('/settings');
    return data.data!;
  },

  getGlobal: async (): Promise<Record<string, string>> => {
    const { data } = await api.get<APIResponse<Record<string, string>>>('/settings');
    return data.data!;
  },

  update: async (settings: Record<string, string>): Promise<Record<string, string>> => {
    const { data } = await api.put<APIResponse<Record<string, string>>>('/settings', settings);
    return data.data!;
  },

  updateGlobal: async (settings: Record<string, string>): Promise<Record<string, string>> => {
    const { data } = await api.put<APIResponse<Record<string, string>>>('/settings', settings);
    return data.data!;
  },

  sendEmailTest: async (to?: string): Promise<{ sent: boolean; to: string }> => {
    const payload = to ? { to } : {};
    const { data } = await api.post<APIResponse<{ sent: boolean; to: string }>>('/settings/email/test', payload);
    return data.data!;
  },
};

// ============================================================================
// Feedback
// ============================================================================

export const feedbackAPI = {
  submit: async (payload: { message: string; category?: FeedbackItem['category'] }): Promise<FeedbackItem> => {
    const { data } = await api.post<APIResponse<FeedbackItem>>('/feedback', payload);
    return data.data!;
  },

  list: async (params?: { status?: string; search?: string; limit?: number }): Promise<FeedbackItem[]> => {
    const query: Record<string, string> = {};
    if (params?.status) query.status = params.status;
    if (params?.search) query.search = params.search;
    if (params?.limit) query.limit = String(params.limit);
    const { data } = await api.get<APIResponse<FeedbackItem[]>>('/feedback', { params: query });
    return data.data || [];
  },

  update: async (id: string, payload: { status?: string; admin_note?: string | null }): Promise<FeedbackItem> => {
    const { data } = await api.put<APIResponse<FeedbackItem>>(`/feedback/${id}`, payload);
    return data.data!;
  },
};

// ============================================================================
// Social Moderation (Admin)
// ============================================================================

export interface SocialReport {
  id: string;
  reporterUserId: string;
  reporterDisplayName: string | null;
  targetType: string;
  targetId: string;
  reasonCode: string;
  details: string | null;
  status: 'pending' | 'reviewed' | 'actioned';
  createdAt: string;
  updatedAt: string;
}

export interface SocialModerationAction {
  id: string;
  reportId: string | null;
  targetUserId: string | null;
  targetMeetupId?: string | null;
  targetDisplayName: string | null;
  actionType: 'warn' | 'mute' | 'suspend' | 'ban' | 'remove_meetup';
  durationHours: number | null;
  actionNote: string | null;
  actorUserId: string;
  actorDisplayName: string | null;
  createdAt: string;
}

export interface SocialAbuseCount {
  key: string;
  count: number;
}

export interface SocialAbuseStats {
  windowHours: number;
  sampledRows: number;
  totals: { inWindow: number; processLifetime: number };
  alerting?: {
    windowMs: number;
    cooldownMs: number;
    thresholds: { total: number; rateLimited: number; spamDetected: number };
    currentWindow: { startedAt: string; total: number; rateLimited: number; spamDetected: number };
  };
  breakdown: {
    byCode: SocialAbuseCount[];
    byAction: SocialAbuseCount[];
    byRoute: SocialAbuseCount[];
    topUsers: SocialAbuseCount[];
  };
  rawSignals: { rateLimitEventsByKey: SocialAbuseCount[]; contentFingerprintsByKey: SocialAbuseCount[] };
  recentEvents: Array<{ code: string; action: string; route: string; userId: string | null; retryAfterSeconds: number | null; details: Record<string, unknown> | null; createdAt: string | null }>;
}

export const socialModerationAPI = {
  getReports: async (params?: { status?: string; cursor?: string; limit?: number }): Promise<{ items: SocialReport[]; nextCursor: string | null }> => {
    const { data } = await api.get<APIResponse<{ items: SocialReport[]; nextCursor: string | null }>>('/social/admin/reports', {
      params: { status: params?.status, cursor: params?.cursor, limit: params?.limit },
    });
    return data.data || { items: [], nextCursor: null };
  },

  resolveReport: async (id: string, status: 'reviewed' | 'actioned'): Promise<void> => {
    await api.post(`/social/admin/reports/${id}/resolve`, { status });
  },

  submitAction: async (payload: {
    report_id?: string;
    target_user_id: string;
    action_type: 'warn' | 'mute' | 'suspend' | 'ban';
    action_note?: string;
    duration_hours?: number;
  }): Promise<void> => {
    await api.post('/social/admin/moderation-actions', payload);
  },

  getModerationActions: async (params?: { cursor?: string; limit?: number }): Promise<{ items: SocialModerationAction[]; nextCursor: string | null }> => {
    const { data } = await api.get<APIResponse<{ items: SocialModerationAction[]; nextCursor: string | null }>>('/social/admin/moderation-actions', {
      params: { cursor: params?.cursor, limit: params?.limit },
    });
    return data.data || { items: [], nextCursor: null };
  },

  removeMeetup: async (meetupId: string, payload?: { report_id?: string; action_note?: string }): Promise<void> => {
    await api.post(`/social/admin/meetups/${meetupId}/remove`, payload || {});
  },

  getAbuseStats: async (params?: { hours?: number; recent_limit?: number; max_rows?: number }): Promise<SocialAbuseStats> => {
    const { data } = await api.get<APIResponse<SocialAbuseStats>>('/social/admin/abuse-stats', { params });
    return data.data || {
      windowHours: params?.hours || 24, sampledRows: 0,
      totals: { inWindow: 0, processLifetime: 0 },
      breakdown: { byCode: [], byAction: [], byRoute: [], topUsers: [] },
      rawSignals: { rateLimitEventsByKey: [], contentFingerprintsByKey: [] },
      recentEvents: [],
    };
  },
};

export const systemAPI = {
  health: async (): Promise<{ status: string; version: string; timestamp?: string; build?: { number?: string; date?: string; commit?: string } }> => {
    const { data } = await api.get('/health');
    return data;
  },
};
