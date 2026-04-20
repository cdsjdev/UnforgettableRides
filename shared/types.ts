// Shared TypeScript types for UnforgettableRides.

export type UserRole = 'admin' | 'store_manager' | 'staff' | 'owner' | 'customer' | 'business_member';

export interface APIError {
  code?: string;
  message?: string;
}

export interface APIMeta {
  timestamp?: string;
  request_id?: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
  meta?: APIMeta;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone_number?: string | null;
  avatar_url?: string | null;
  store_id?: string | null;
  email_verified_at?: string | null;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  token?: string;
  user?: User;
  challenge_required?: boolean;
  challenge_id?: string;
  code_expires_at?: string;
  requires_device_verification?: boolean;
  message?: string;
}

export interface CarImage {
  id: string;
  car_id: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
  created_at?: string;
}

export interface ClassicCar {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  description?: string | null;
  tags: string[];
  price_per_hour_cents?: number | null;
  price_per_day_cents?: number | null;
  location?: string | null;
  available_for_hire: boolean;
  is_active: boolean;
  images?: CarImage[];
  primary_image_url?: string | null;
  average_rating?: number | null;
  review_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  car_id: string;
  customer_id: string;
  event_type: string;
  event_date: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  duration_hours?: number | null;
  duration_days?: number | null;
  pickup_location?: string | null;
  notes?: string | null;
  total_price_cents?: number | null;
  stripe_payment_intent_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  car_id: string;
  customer_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  message?: string;
  proposed_price_cents?: number | null;
  event_type?: string | null;
  event_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payout {
  id: string;
  owner_id: string;
  amount_cents: number;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
  notes?: string | null;
  currency?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type FeedbackStatus = 'new' | 'reviewed' | 'resolved';

export interface FeedbackItem {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  category: string;
  subject?: string | null;
  message: string;
  status: FeedbackStatus;
  admin_note?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface SocialUserSummary {
  userId?: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface SocialMessage {
  id: string;
  threadId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  isRead?: boolean;
}

export interface SocialThread {
  id: string;
  otherUser?: SocialUserSummary;
  participants?: SocialUserSummary[];
  lastMessagePreview?: string;
  lastMessageAt?: string;
  lastMessage?: SocialMessage | null;
  unreadCount: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface SocialPage<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  selected_pack_option_id?: string | null;
}

export interface CartItem {
  cart_key: string;
  product: Product;
  quantity: number;
}

export interface PaymentConfig {
  provider?: string;
  currency?: string;
  publishable_key?: string;
  square_application_id?: string;
  square_location_id?: string;
  environment?: 'sandbox' | 'production' | string;
}

export interface Payment {
  id: string;
  order_id?: string;
  provider?: string;
  status?: string;
  amount?: number;
  client_secret?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AnalyticsSummary {
  metrics_default?: 'tracked' | 'legacy';
  tracked_entries?: number;
  tracked_exits?: number;
  total_entries?: number;
  total_exits?: number;
}
