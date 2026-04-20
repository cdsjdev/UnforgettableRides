import axios from 'axios';
import type { User, LoginResponse, APIResponse, SocialThread, SocialMessage, SocialPage } from '@shared/types';

export interface ClassicCar {
  id: string;
  owner_id: string;
  owner?: { id: string; name: string; avatar_url?: string | null };
  make: string;
  model: string;
  year: number;
  color: string;
  description: string | null;
  tags: string[];
  price_per_hour_cents: number | null;
  price_per_day_cents: number | null;
  location: string | null;
  available_for_hire: boolean;
  is_active: boolean;
  images: CarImage[];
  primary_image_url?: string | null;
  average_rating?: number | null;
  review_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CarImage {
  id: string;
  car_id: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

export interface Booking {
  id: string;
  car_id: string;
  car?: ClassicCar;
  customer_id: string;
  customer?: { id: string; name: string; email: string };
  event_type: string;
  event_date: string;
  duration_hours?: number | null;
  duration_days?: number | null;
  pickup_location?: string | null;
  notes?: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  total_price_cents?: number | null;
  price_breakdown?: Record<string, number> | null;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  car_id: string;
  car?: ClassicCar;
  customer_id: string;
  message: string;
  proposed_price_cents?: number | null;
  event_type?: string | null;
  event_date?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  car_id: string;
  booking_id?: string | null;
  reviewer_id: string;
  reviewer?: { name: string; avatar_url?: string | null };
  rating: number;
  text?: string | null;
  photo_urls: string[];
  created_at: string;
}

export interface CarFilters {
  tag?: string;
  make?: string;
  year_min?: number;
  year_max?: number;
  location?: string;
  owner_id?: string;
  limit?: number;
  offset?: number;
}

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 12000,
});

const TOKEN_KEY = 'rides_token';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('rides_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ───────────────────────────────────────────────────────
export const authAPI = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post<APIResponse<LoginResponse>>('/auth/login', { email, password });
    return data.data!;
  },

  signup: async (payload: { email: string; password: string; name: string; role?: string }): Promise<LoginResponse> => {
    const { data } = await api.post<APIResponse<LoginResponse>>('/auth/signup', payload);
    return data.data!;
  },

  me: async (): Promise<User> => {
    const { data } = await api.get<APIResponse<User>>('/auth/me');
    return data.data!;
  },

  verifyDeviceLogin: async (challenge_id: string, code: string, device_id?: string, device_name?: string): Promise<LoginResponse> => {
    const { data } = await api.post<APIResponse<LoginResponse>>('/auth/login/verify-device', {
      challenge_id,
      code,
      device_id,
      device_name,
    });
    return data.data!;
  },

  forgotPassword: async (email: string, client: 'app' | 'dashboard' = 'app'): Promise<{ message: string }> => {
    const { data } = await api.post<APIResponse<{ message: string }>>('/auth/password/forgot', { email, client });
    return data.data || { message: 'If this email is registered, a password reset link has been sent.' };
  },

  resetPassword: async (token: string, new_password: string): Promise<{ message: string }> => {
    const { data } = await api.post<APIResponse<{ message: string }>>('/auth/password/reset', { token, new_password });
    return data.data || { message: 'Password reset successfully' };
  },

  sendEmailVerification: async (): Promise<{ message?: string; sent?: boolean; already_verified?: boolean; expires_at?: string }> => {
    const { data } = await api.post<APIResponse<{ message?: string; sent?: boolean; already_verified?: boolean; expires_at?: string }>>('/auth/email/send-verification');
    return data.data || {};
  },

  verifyEmailCode: async (code: string): Promise<{ verified: boolean; email_verified_at?: string; user?: User }> => {
    const { data } = await api.post<APIResponse<{ verified: boolean; email_verified_at?: string; user?: User }>>('/auth/email/verify', { code });
    return data.data!;
  },

  becomeOwner: async (): Promise<User> => {
    const { data } = await api.post<APIResponse<User>>('/auth/role/become-owner');
    return data.data!;
  },

  updateProfile: async (updates: { name?: string; avatar_url?: string | null }): Promise<User> => {
    const { data } = await api.put<APIResponse<User>>('/auth/profile', updates);
    return data.data!;
  },

  uploadProfileImage: async (file: File): Promise<string> => {
    const form = new FormData();
    form.append('image', file);
    const { data } = await api.post<APIResponse<{ url: string }>>('/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data?.url || '';
  },
};

// ── Cars ───────────────────────────────────────────────────────
export const carsAPI = {
  getAll: async (filters: CarFilters = {}): Promise<ClassicCar[]> => {
    const params: Record<string, string | number> = {};
    if (filters.tag)      params.tag      = filters.tag;
    if (filters.make)     params.make     = filters.make;
    if (filters.year_min) params.year_min = filters.year_min;
    if (filters.year_max) params.year_max = filters.year_max;
    if (filters.location) params.location = filters.location;
    if (filters.limit)    params.limit    = filters.limit;
    if (filters.offset)   params.offset   = filters.offset;
    const { data } = await api.get<APIResponse<any>>('/cars', { params });
    const payload = data.data;
    return Array.isArray(payload) ? payload : (payload?.items ?? []);
  },

  getFeatured: async (): Promise<ClassicCar[]> => {
    const { data } = await api.get<APIResponse<ClassicCar[]>>('/cars/featured');
    return data.data ?? [];
  },

  getById: async (id: string): Promise<ClassicCar & { reviews?: Review[] }> => {
    const { data } = await api.get<APIResponse<ClassicCar & { reviews?: Review[] }>>(`/cars/${id}`);
    return data.data!;
  },

  create: async (payload: Partial<ClassicCar>): Promise<ClassicCar> => {
    const { data } = await api.post<APIResponse<ClassicCar>>('/cars', payload);
    return data.data!;
  },

  update: async (id: string, payload: Partial<ClassicCar>): Promise<ClassicCar> => {
    const { data } = await api.put<APIResponse<ClassicCar>>(`/cars/${id}`, payload);
    return data.data!;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/cars/${id}`);
  },

  uploadImage: async (carId: string, file: File): Promise<CarImage> => {
    const form = new FormData();
    form.append('image', file);
    const { data } = await api.post<APIResponse<CarImage>>(`/cars/${carId}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data!;
  },

  deleteImage: async (carId: string, imageId: string): Promise<void> => {
    await api.delete(`/cars/${carId}/images/${imageId}`);
  },

  getAvailability: async (carId: string): Promise<string[]> => {
    const { data } = await api.get<APIResponse<{ blocked_dates: string[] }>>(`/cars/${carId}/availability`);
    return data.data?.blocked_dates ?? [];
  },

  blockDate: async (carId: string, blocked_date: string, reason?: string): Promise<void> => {
    await api.post(`/cars/${carId}/availability`, { blocked_date, reason });
  },

  submitReview: async (carId: string, review: { rating: number; text?: string }): Promise<Review> => {
    const { data } = await api.post<APIResponse<Review>>(`/cars/${carId}/reviews`, review);
    return data.data!;
  },
};

// ── Bookings ───────────────────────────────────────────────────
export const bookingsAPI = {
  create: async (payload: {
    car_id: string;
    event_type: string;
    event_date: string;
    duration_hours?: number;
    duration_days?: number;
    pickup_location?: string;
    notes?: string;
  }): Promise<Booking> => {
    const { data } = await api.post<APIResponse<Booking>>('/bookings', payload);
    return data.data!;
  },

  getMine: async (status?: string): Promise<Booking[]> => {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    const { data } = await api.get<APIResponse<Booking[]>>('/bookings', { params });
    return data.data ?? [];
  },

  getById: async (id: string): Promise<Booking> => {
    const { data } = await api.get<APIResponse<Booking>>(`/bookings/${id}`);
    return data.data!;
  },

  updateStatus: async (id: string, status: string): Promise<Booking> => {
    const { data } = await api.patch<APIResponse<Booking>>(`/bookings/${id}/status`, { status });
    return data.data!;
  },
};

// ── Quotes ─────────────────────────────────────────────────────
export const quotesAPI = {
  create: async (payload: {
    car_id: string;
    message: string;
    proposed_price_cents?: number;
    event_type?: string;
    event_date?: string;
  }): Promise<Quote> => {
    const { data } = await api.post<APIResponse<Quote>>('/quotes', payload);
    return data.data!;
  },

  getMine: async (): Promise<Quote[]> => {
    const { data } = await api.get<APIResponse<Quote[]>>('/quotes');
    return data.data ?? [];
  },

  updateStatus: async (id: string, status: string): Promise<Quote> => {
    const { data } = await api.patch<APIResponse<Quote>>(`/quotes/${id}/status`, { status });
    return data.data!;
  },
};

// ── Messaging ──────────────────────────────────────────────────
export const messagingAPI = {
  getThreads: async (cursor?: string, limit = 30): Promise<SocialPage<SocialThread>> => {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    const { data } = await api.get<APIResponse<SocialPage<SocialThread>>>('/social/threads', { params });
    return data.data ?? { items: [], nextCursor: null };
  },

  createThread: async (recipient_id: string): Promise<{ threadId: string; created: boolean }> => {
    const { data } = await api.post<APIResponse<{ threadId: string; created: boolean }>>('/social/threads', { recipient_id });
    return data.data!;
  },

  getMessages: async (threadId: string, cursor?: string, limit = 50): Promise<SocialPage<SocialMessage>> => {
    const params: Record<string, string | number> = { limit };
    if (cursor) params.cursor = cursor;
    const { data } = await api.get<APIResponse<SocialPage<SocialMessage>>>(`/social/threads/${threadId}/messages`, { params });
    return data.data ?? { items: [], nextCursor: null };
  },

  sendMessage: async (threadId: string, body: string): Promise<SocialMessage> => {
    const { data } = await api.post<APIResponse<SocialMessage>>(`/social/threads/${threadId}/messages`, { body });
    return data.data!;
  },

  getUnreadCount: async (): Promise<number> => {
    const { data } = await api.get<APIResponse<{ unread?: number; unread_count?: number; unreadCount?: number }>>('/social/threads/unread-count');
    return Number(data.data?.unread ?? data.data?.unread_count ?? data.data?.unreadCount ?? 0);
  },

  markRead: async (threadId: string, lastReadMessageId: string): Promise<void> => {
    await api.patch(`/social/threads/${threadId}/read`, { last_read_message_id: lastReadMessageId });
  },
};

export { TOKEN_KEY };
