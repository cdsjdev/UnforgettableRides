import axios from 'axios';
import type {
  APIResponse,
  User,
  LoginResponse,
  Payment,
  PaymentConfig,
  FeedbackItem,
  SocialThread,
  SocialMessage,
  SocialPage,
  ClassicCar,
  Booking,
  Quote,
} from '../../../shared/types';

const FALLBACK_LOCAL_API_URL = 'http://localhost:3000/api/v1';
const rawApiBaseUrl = (process.env.EXPO_PUBLIC_API_URL || '').trim();
const isLocalApiUrl = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(rawApiBaseUrl);
const isHttpsApiUrl = /^https:\/\//i.test(rawApiBaseUrl);
const isRelativeApiUrl = /^\/(?!\/)/.test(rawApiBaseUrl);
const isDevRuntime = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

if (!isDevRuntime) {
  if (!rawApiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is required in production.');
  }
  if (isLocalApiUrl) {
    throw new Error(`EXPO_PUBLIC_API_URL must not use localhost in production. Received: "${rawApiBaseUrl}".`);
  }
  if (!isHttpsApiUrl && !isRelativeApiUrl) {
    throw new Error(`EXPO_PUBLIC_API_URL must use HTTPS or a relative path in production. Received: "${rawApiBaseUrl}".`);
  }
}

export const API_BASE_URL = rawApiBaseUrl || FALLBACK_LOCAL_API_URL;
const SERVER_BASE_URL = API_BASE_URL.replace(/\/api\/v\d+$/, '');

export const getFullImageUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${SERVER_BASE_URL}${url}`;
};

let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (_authToken) {
    config.headers.Authorization = `Bearer ${_authToken}`;
  }
  return config;
});

// ============================================================================
// Auth
// ============================================================================

export const authAPI = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post<APIResponse<LoginResponse>>('/auth/login', { email, password });
    if (!response.data.data) throw new Error('Login failed');
    return response.data.data;
  },

  register: async (name: string, email: string, password: string, role?: string): Promise<LoginResponse> => {
    const response = await api.post<APIResponse<LoginResponse>>('/auth/signup', { name, email, password, role });
    if (!response.data.data) throw new Error('Registration failed');
    return response.data.data;
  },

  verifyDeviceLogin: async (
    challenge_id: string,
    code: string,
    device_id?: string,
    device_name?: string
  ): Promise<LoginResponse> => {
    const response = await api.post<APIResponse<LoginResponse>>('/auth/login/verify-device', {
      challenge_id,
      code,
      device_id,
      device_name,
    });
    if (!response.data.data) throw new Error('Login verification failed');
    return response.data.data;
  },

  me: async (): Promise<User> => {
    const response = await api.get<APIResponse<User>>('/auth/me');
    if (!response.data.data) throw new Error('Failed to get user');
    return response.data.data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.put('/auth/password', { current_password: currentPassword, new_password: newPassword });
  },

  forgotPassword: async (email: string): Promise<void> => {
    await api.post('/auth/password/forgot', { email });
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    await api.post('/auth/password/reset', { token, new_password: newPassword });
  },

  updateProfile: async (updates: { name?: string; avatar_url?: string | null }): Promise<User> => {
    const response = await api.put<APIResponse<User>>('/auth/profile', updates);
    if (!response.data.data) throw new Error('Failed to update profile');
    return response.data.data;
  },

  uploadProfileImage: async (imageUri: string): Promise<string> => {
    const formData = new FormData();
    const filename = imageUri.split('/').pop() || 'avatar.jpg';
    formData.append('image', { uri: imageUri, name: filename, type: 'image/jpeg' } as any);
    const headers: Record<string, string> = { 'Content-Type': 'multipart/form-data' };
    if (_authToken) headers.Authorization = `Bearer ${_authToken}`;
    const response = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: formData, headers });
    if (!response.ok) throw new Error('Avatar upload failed');
    const payload = await response.json();
    return String(payload?.data?.url || '');
  },

  deleteAccount: async (currentPassword: string): Promise<void> => {
    await api.delete('/auth/account', { data: { current_password: currentPassword } });
  },

  becomeOwner: async (): Promise<User> => {
    const response = await api.post<APIResponse<User>>('/auth/role/become-owner');
    if (!response.data.data) throw new Error('Failed to enable owner access');
    return response.data.data;
  },
};

// ============================================================================
// Cars
// ============================================================================

export interface CarFilters {
  tag?: string;
  make?: string;
  year_min?: number;
  year_max?: number;
  location?: string;
  owner_id?: string;
  available_only?: boolean;
}

export const carsAPI = {
  getAll: async (filters?: CarFilters): Promise<ClassicCar[]> => {
    const response = await api.get<APIResponse<any>>('/cars', { params: filters });
    const payload = response.data.data;
    return Array.isArray(payload) ? payload : (payload?.items ?? []);
  },

  getFeatured: async (): Promise<ClassicCar[]> => {
    const response = await api.get<APIResponse<ClassicCar[]>>('/cars/featured');
    return response.data.data || [];
  },

  getById: async (id: string): Promise<ClassicCar> => {
    const response = await api.get<APIResponse<ClassicCar>>(`/cars/${id}`);
    if (!response.data.data) throw new Error('Car not found');
    return response.data.data;
  },

  create: async (payload: Partial<ClassicCar>): Promise<ClassicCar> => {
    const response = await api.post<APIResponse<ClassicCar>>('/cars', payload);
    if (!response.data.data) throw new Error('Failed to create car');
    return response.data.data;
  },

  update: async (id: string, updates: Partial<ClassicCar>): Promise<ClassicCar> => {
    const response = await api.put<APIResponse<ClassicCar>>(`/cars/${id}`, updates);
    if (!response.data.data) throw new Error('Failed to update car');
    return response.data.data;
  },

  uploadImage: async (carId: string, imageUri: string): Promise<void> => {
    const formData = new FormData();
    const filename = imageUri.split('/').pop() || 'car.jpg';
    formData.append('image', { uri: imageUri, name: filename, type: 'image/jpeg' } as any);
    const headers: Record<string, string> = { 'Content-Type': 'multipart/form-data' };
    if (_authToken) headers.Authorization = `Bearer ${_authToken}`;
    await fetch(`${API_BASE_URL}/cars/${carId}/images`, { method: 'POST', body: formData, headers });
  },

  getAvailability: async (carId: string): Promise<string[]> => {
    const response = await api.get<APIResponse<Array<{ blocked_date: string }>>>(`/cars/${carId}/availability`);
    return (response.data.data || []).map(r => r.blocked_date);
  },
};

// ============================================================================
// Bookings
// ============================================================================

export const bookingsAPI = {
  getAll: async (params?: { status?: string }): Promise<Booking[]> => {
    const response = await api.get<APIResponse<Booking[]>>('/bookings', { params });
    return response.data.data || [];
  },

  getById: async (id: string): Promise<Booking> => {
    const response = await api.get<APIResponse<Booking>>(`/bookings/${id}`);
    if (!response.data.data) throw new Error('Booking not found');
    return response.data.data;
  },

  create: async (payload: {
    car_id: string;
    event_type: string;
    event_date: string;
    duration_hours?: number;
    duration_days?: number;
    pickup_location?: string;
    notes?: string;
  }): Promise<Booking> => {
    const response = await api.post<APIResponse<Booking>>('/bookings', payload);
    if (!response.data.data) throw new Error('Failed to create booking');
    return response.data.data;
  },

  updateStatus: async (id: string, status: string): Promise<Booking> => {
    const response = await api.patch<APIResponse<Booking>>(`/bookings/${id}/status`, { status });
    if (!response.data.data) throw new Error('Failed to update booking');
    return response.data.data;
  },
};

// ============================================================================
// Quotes
// ============================================================================

export const quotesAPI = {
  getAll: async (): Promise<Quote[]> => {
    const response = await api.get<APIResponse<Quote[]>>('/quotes');
    return response.data.data || [];
  },

  create: async (payload: {
    car_id: string;
    message: string;
    event_type?: string;
    event_date?: string;
  }): Promise<Quote> => {
    const response = await api.post<APIResponse<Quote>>('/quotes', payload);
    if (!response.data.data) throw new Error('Failed to create quote');
    return response.data.data;
  },

  updateStatus: async (id: string, status: string): Promise<Quote> => {
    const response = await api.patch<APIResponse<Quote>>(`/quotes/${id}/status`, { status });
    if (!response.data.data) throw new Error('Failed to update quote');
    return response.data.data;
  },
};

// ============================================================================
// Messaging (DM threads)
// ============================================================================

export const messagingAPI = {
  getThreads: async (params?: { cursor?: string; limit?: number }): Promise<SocialPage<SocialThread>> => {
    const response = await api.get<APIResponse<SocialPage<SocialThread>>>('/social/threads', { params });
    return response.data.data || { items: [], nextCursor: null };
  },

  getMessages: async (threadId: string, params?: { cursor?: string; limit?: number }): Promise<SocialPage<SocialMessage>> => {
    const response = await api.get<APIResponse<SocialPage<SocialMessage>>>(`/social/threads/${threadId}/messages`, { params });
    return response.data.data || { items: [], nextCursor: null };
  },

  sendMessage: async (threadId: string, body: string): Promise<SocialMessage> => {
    const response = await api.post<APIResponse<SocialMessage>>(`/social/threads/${threadId}/messages`, {
      body,
      messageType: 'text',
    });
    if (!response.data.data) throw new Error('Failed to send message');
    return response.data.data;
  },

  createThread: async (otherUserId: string, message: string): Promise<{ thread: SocialThread; message: SocialMessage }> => {
    const response = await api.post<APIResponse<any>>('/social/threads', {
      recipient_id: otherUserId,
      initial_message: message,
    });
    const payload = response.data.data;
    if (payload?.thread && payload?.message) {
      return payload;
    }
    if (!payload?.threadId) throw new Error('Failed to create thread');

    // Backward-compatible fallback when API returns only { threadId, created }.
    const threads = await messagingAPI.getThreads({ limit: 50 });
    const thread = threads.items.find((t) => t.id === payload.threadId);
    if (!thread) throw new Error('Thread created but not retrievable');

    const messages = await messagingAPI.getMessages(payload.threadId, { limit: 20 });
    const createdMessage = messages.items.find((m) => m.body === message && m.senderUserId) || messages.items[0];
    if (!createdMessage) throw new Error('Thread created but message not found');

    return { thread, message: createdMessage };
  },

  markRead: async (threadId: string, lastReadMessageId: string): Promise<void> => {
    await api.post(`/social/threads/${threadId}/read`, { last_read_message_id: lastReadMessageId });
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await api.get<APIResponse<{ unreadCount?: number; unread_count?: number; unread?: number }>>('/social/threads/unread-count');
    return Number(response.data.data?.unreadCount ?? response.data.data?.unread_count ?? response.data.data?.unread ?? 0);
  },
};

// ============================================================================
// Payments
// ============================================================================

export const paymentsAPI = {
  getConfig: async (): Promise<PaymentConfig> => {
    const response = await api.get<APIResponse<PaymentConfig>>('/payments/config');
    if (!response.data.data) throw new Error('Failed to get payment config');
    return response.data.data;
  },

  createPaymentIntent: async (payload: {
    amount: number;
    currency?: string;
    booking_id?: string;
    metadata?: Record<string, string>;
  }): Promise<Payment> => {
    const response = await api.post<APIResponse<Payment>>('/payments/intent', payload);
    if (!response.data.data) throw new Error('Failed to create payment intent');
    return response.data.data;
  },
};

// ============================================================================
// Feedback
// ============================================================================

export const feedbackAPI = {
  submit: async (message: string, category?: FeedbackItem['category']): Promise<FeedbackItem> => {
    const response = await api.post<APIResponse<FeedbackItem>>('/feedback', { message, category });
    if (!response.data.data) throw new Error('Failed to submit feedback');
    return response.data.data;
  },
};

// ============================================================================
// Health
// ============================================================================

export const healthCheck = async (): Promise<{ status: string; version: string; build?: { date?: string; commit?: string } }> => {
  const response = await api.get('/health');
  return response.data;
};
