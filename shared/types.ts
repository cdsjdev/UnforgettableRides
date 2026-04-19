// Shared TypeScript types for UnforgettableRides app and API
// Based on specs in docs/specs/02-data-schemas.md

// ============================================================================
// Dog Profile Types
// ============================================================================

export interface DogProfile {
  id: string;
  user_id: string;
  name: string;
  photo_urls: string[];
  created_at: string;
  updated_at: string;

  // Basic info
  age_months: number | null;
  weight_lbs: number | null;
  sex: "male" | "female" | "unknown" | null;
  neutered_spayed: boolean | null;

  // Traits
  traits: DogTraits;
  confirmed_traits: Partial<DogTraits>;

  // Breed
  breed_info: BreedInfo;

  // Health & behavior
  health: HealthInfo;

  // Preferences
  grooming_preferences: GroomingPreferences;

  // History
  wash_history: WashRecord[];

  // Weight tracking
  weight_history: WeightEntry[];

  // Medical records
  vaccinations: VaccinationRecord[];
  medications: MedicationRecord[];
}

// ============================================================================
// Dog Traits
// ============================================================================

export interface DogTraits {
  size_class: "XS" | "S" | "M" | "L" | "XL";
  height_inches: number | null;

  coat_length: "short" | "medium" | "long";
  coat_texture: "smooth" | "curly" | "wire" | "silky" | "double";
  has_undercoat: boolean;

  shedding_level: "low" | "medium" | "high";
  mat_risk: "low" | "medium" | "high";
  current_mat_level: "none" | "light" | "moderate" | "severe";

  skin_sensitivity: "low" | "medium" | "high";

  is_brachycephalic: boolean;
  ear_type: "floppy" | "erect" | "semi_erect" | null;

  confidence: {
    size_class: number;
    coat_length: number;
    coat_texture: number;
    has_undercoat: number;
  };
}

// ============================================================================
// Breed Information
// ============================================================================

export interface BreedInfo {
  predictions: BreedPrediction[];
  is_purebred: boolean;
  is_mix: boolean;
  user_confirmed_breed: string | null;
  user_confirmed_mix: string[] | null;
}

export interface BreedPrediction {
  breed_name: string;
  confidence: number;
  rank: number;
  akc_group: string | null;
}

// ============================================================================
// Health Information
// ============================================================================

export interface HealthInfo {
  has_allergies: boolean;
  allergy_notes: string | null;
  has_skin_conditions: boolean;
  skin_condition_notes: string | null;
  prone_to_ear_infections: boolean;
  noise_sensitive: boolean;
  dryer_tolerant: boolean;
  water_fearful: boolean;
  vet_grooming_restrictions: string | null;
  last_vet_visit: string | null;
}

// ============================================================================
// Weight Tracking
// ============================================================================

export interface WeightEntry {
  date: string;
  weight_lbs: number;
}

// ============================================================================
// Medical Records
// ============================================================================

export interface VaccinationRecord {
  id: string;
  name: string;
  date_given: string;
  next_due_date: string | null;
  vet_name: string | null;
  notes: string | null;
}

export interface MedicationRecord {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
}

// ============================================================================
// Grooming Preferences
// ============================================================================

export type ShampooType =
  | "regular"
  | "hypoallergenic"
  | "deodorizing"
  | "anti_shedding"
  | "medicated"
  | "puppy_gentle";

export interface GroomingPreferences {
  preferred_shampoo_type: ShampooType | "auto";
  fragrance_preference: "fragrance_free" | "light" | "any";
  water_temp_preference: "cool" | "lukewarm" | "warm" | "auto";
  dryer_preference: "none" | "low" | "medium" | "high" | "auto";
  avoid_conditioner: boolean;
  typical_wash_frequency_weeks: number | null;
  special_instructions: string | null;
}

// ============================================================================
// Wash Cycle
// ============================================================================

export interface WashCycle {
  id: string;
  name: string;
  description: string;
  parameters: WashParameters;
  prep_steps: string[];
  suitable_for: string[];
  cautions: string[];
  why_this_cycle: string[];
  is_custom: boolean;
  popularity_score: number;
}

export interface WashParameters {
  water_temp: "cool" | "lukewarm" | "warm";
  shampoo_type: ShampooType;
  wash_duration: "short" | "standard" | "extended";
  rinse: "standard" | "extra" | "double";
  conditioner: "none" | "light" | "full";
  dryer: "none" | "low" | "medium" | "high";
  dryer_duration_min: number;
}

// ============================================================================
// Wash Recommendation
// ============================================================================

export interface WashRecommendation {
  id: string;
  dog_id: string | null;
  created_at: string;

  recommended_cycle: WashCycle;
  confidence: number;
  recommended_program?: RecommendedWashProgram;

  alternative_cycles: {
    cycle: WashCycle;
    confidence: number;
    reason: string;
  }[];

  why_recommended: string[];
  prep_required: PrepRequirement[];
  safety_warnings: string[];
  safety_blocks: string[];

  qr_code_data: string;
  qr_code_url: string | null;
}

export interface RecommendedWashProgram {
  cycle_program_id: "sensitive_care" | "balanced_clean" | "deep_clean" | "detangle_care";
  cycle_program_name: string;
  shampoo_scent: "scented" | "unscented";
  shampoo_amount_ml: number;
  brush_motion: "low_short" | "medium_balanced" | "medium_high" | "low_medium_detangle";
  reasons: string[];
  cautions: string[];
  profile_snapshot: {
    coat_type: "short" | "long" | "curly" | "double" | "unknown";
    skin_sensitivity: "none" | "mild" | "high";
    scent_preference: "scented" | "unscented" | "no_preference";
    weight_kg: number | null;
    age_group: "puppy" | "adult" | "senior";
    matting_level: "none" | "light" | "heavy";
    wash_history_count: number;
    dirt_level_today: "light" | "medium" | "heavy";
  };
}

export interface PrepRequirement {
  step: string;
  required: boolean;
  completed: boolean;
}

// ============================================================================
// Wash Record
// ============================================================================

export interface WashRecord {
  id: string;
  dog_id: string;
  wash_date: string;

  cycle_used: WashCycle;
  was_recommended: boolean;

  pre_wash_condition: {
    dirt_level: "light" | "moderate" | "heavy";
    mat_level: "none" | "light" | "moderate" | "severe";
    odor_level: "none" | "light" | "moderate" | "strong";
  };

  outcome: WashOutcome;
  notes: string | null;
}

export interface WashOutcome {
  cleanliness_rating: number | null;
  coat_softness_rating: number | null;
  odor_removal_rating: number | null;
  dog_comfort_rating: number | null;

  had_issues: boolean;
  issues: string[];

  would_use_again: boolean | null;
}

// ============================================================================
// ML Model Types
// ============================================================================

export interface MLModelInput {
  images: ImageInput[];
  context?: {
    user_weight_estimate_lbs?: number;
    user_height_estimate_inches?: number;
    user_coat_description?: string;
    location_climate?: "cold" | "temperate" | "hot";
  };
}

export interface ImageInput {
  image_data: string;
  image_type: "front" | "side" | "rear" | "face" | "full_body" | "other";
  quality_score?: number;
  timestamp?: string;
}

export interface MLModelOutput {
  model_version: string;
  inference_time_ms: number;

  breed_predictions: BreedPrediction[];
  is_purebred_probability: number;

  predicted_traits: DogTraits;

  image_quality: {
    overall_score: number;
    issues: string[];
  };

  needs_user_confirmation: string[];

  // Analysis source metadata (added by hybrid endpoint)
  _analysis_source?: 'ml_service' | 'llm_vision' | 'llm_vision_enhanced' | 'mock';
  _llm_provider?: string;
  _ml_breed?: string;
  _ml_confidence?: number;
  _fallback?: boolean;
  subject_type?: 'real_dog' | 'not_a_dog' | 'uncertain';
  analysis_note?: string | null;

  debug?: {
    attention_maps?: string[];
    feature_activations?: object;
  };
}

// ============================================================================
// Care Types
// ============================================================================

export type CareCategory =
  | "brushing"
  | "ear_care"
  | "nail_care"
  | "exercise"
  | "health_check"
  | "wash_reminder"
  | "teeth_brushing"
  | "skin_check"
  | "medication"
  | "vet_visit"
  | "other";

export interface CareSuggestion {
  id: string;
  dog_id: string;
  date: string;
  suggestions: CareSuggestionItem[];
}

export interface CareSuggestionItem {
  category: CareCategory;
  priority: "low" | "medium" | "high";
  title: string;
  description: string;
  action_required: boolean;
  completed: boolean;
  reason: string;
  learn_more_url: string | null;
}

export interface CareEvent {
  id: string;
  dog_id: string;
  category: CareCategory;
  date: string;
  notes: string | null;
  duration_minutes: number | null;
}

export interface CareStreak {
  dog_id: string;
  current_streak: number;
  last_completed_date: string | null;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
  meta?: {
    timestamp: string;
    request_id: string;
  };
}

export interface APIError {
  code: string;
  message: string;
  details?: any;
}

// ============================================================================
// QR Code Data
// ============================================================================

export interface QRCodeData {
  version: string;
  cycle_id: string;
  custom: boolean;
  parameters: WashParameters;
  prep_complete: boolean;
  timestamp: string;
  dog_name?: string;
  dog_weight_lbs?: number;
  safety_verified?: boolean;
}

// ============================================================================
// AI Advisor Types
// ============================================================================

export type LLMProvider = "claude" | "chatgpt" | "gemini";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  provider: LLMProvider;
  suggested_action?: AdvisorSuggestedAction;
}

export interface ChatSession {
  id: string;
  created_at: string;
  updated_at: string;
  provider: LLMProvider;
  messages: ChatMessage[];
}

export interface ChatResponse {
  message: ChatMessage;
  session_id: string;
  provider?: LLMProvider;
  suggested_action?: AdvisorSuggestedAction;
}

export interface AdvisorStatus {
  available_providers: LLMProvider[];
  default_provider: LLMProvider | null;
  model_by_provider?: Partial<Record<LLMProvider, string>>;
}

export type AdvisorActionType =
  | "log_care_event"
  | "add_weight_entry"
  | "add_medication_record";

export interface LogCareEventActionPayload {
  dog_id: string;
  category: CareCategory;
  date?: string;
  notes?: string | null;
  duration_minutes?: number | null;
}

export interface AddWeightEntryActionPayload {
  dog_id: string;
  date?: string;
  weight_lbs: number;
}

export interface AddMedicationRecordActionPayload {
  dog_id: string;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  start_date?: string;
  end_date?: string | null;
  notes?: string | null;
}

export interface AdvisorSuggestedAction {
  type: AdvisorActionType;
  title: string;
  reason?: string;
  payload:
    | LogCareEventActionPayload
    | AddWeightEntryActionPayload
    | AddMedicationRecordActionPayload;
}

export interface AdvisorActionExecuteResponse {
  success: boolean;
  action_type: AdvisorActionType;
  summary: string;
}

// ============================================================================
// Breed Database
// ============================================================================

export interface BreedData {
  name: string;
  typical_traits: Partial<DogTraits> & {
    weight_range_lbs: [number, number];
    height_range_inches: [number, number];
    common_colors: string[];
  };
  akc_group: string;
}

// ============================================================================
// Camera Analytics Types
// ============================================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface DogDetection {
  id: number;
  timestamp: string;
  dog_count: number;
  detections: BoundingBox[];
  frame_url?: string;
  camera_id: string;
}

export interface DogEntry {
  id: number;
  timestamp: string;
  direction: "enter" | "exit";
  dog_count_before: number;
  dog_count_after: number;
  confidence: number;
  camera_id: string;
}

export interface AnalyticsSummary {
  date: string;
  total_entries: number;
  total_exits: number;
  tracked_entries?: number;
  tracked_exits?: number;
  tracking_active?: boolean;
  tracker_mode?: 'byte_track' | 'greedy_fallback' | 'disabled' | 'unknown' | string;
  metrics_default?: 'tracked' | 'legacy';
  metrics_default_recommended?: 'tracked' | 'legacy';
  flow_gap_threshold_pct?: number;
  rollout_stable_days?: number;
  rollout_min_daily_legacy_flow?: number;
  metrics_rollout_policy?: {
    rule: string;
    stable_days_required: number;
    stable_days_observed: number;
    min_daily_legacy_flow: number;
    gap_threshold_pct: number;
    tracked_default_eligible: boolean;
    recommended_default: 'tracked' | 'legacy';
    recent_days: Array<{
      date: string;
      legacy_total_flow: number;
      tracked_total_flow: number;
      flow_gap_pct: number | null;
      qualifies: boolean;
    }>;
  };
  tracked_vs_legacy_entry_delta?: number;
  tracked_vs_legacy_exit_delta?: number;
  tracked_vs_legacy_flow_delta_abs?: number;
  tracked_vs_legacy_flow_delta_pct?: number;
  peak_count: number;
  current_count: number;
  avg_dogs_per_hour: number;
  busiest_hour: string;
  camera_uptime_pct: number;
}

export interface AnalyticsHourlyData {
  hour: number;
  entries: number;
  exits: number;
  peak_count: number;
  avg_count: number;
}

export interface CameraStatus {
  status: "connected" | "disconnected" | "not_configured";
  camera_url: string | null;
  last_frame_at: string | null;
  capture_interval_sec: number;
  detector_loaded: boolean;
}

export interface AnalyticsCurrent {
  dog_count: number;
  detections: BoundingBox[];
  timestamp: string;
  camera_status: CameraStatus["status"];
}

export interface VideoAnalysisTopFrame {
  timestamp_sec: number;
  dog_count: number;
  avg_confidence: number;
  frame_url?: string | null;
}

export interface VideoAnalysisResult {
  filename: string;
  duration_sec: number;
  fps: number;
  total_frames: number;
  frames_analyzed: number;
  sample_interval_frames: number;
  max_dogs_in_frame: number;
  avg_dogs_per_analyzed_frame: number;
  frames_with_dogs: number;
  dog_presence_rate_pct: number;
  top_frames: VideoAnalysisTopFrame[];
}

export interface AnalyticsTriggerFrame {
  id: number;
  timestamp: string;
  source_type: string;
  camera_id: string;
  store_id?: string | null;
  dog_count: number;
  avg_confidence: number;
  frame_url: string;
  created_at: string;
  meta?: Record<string, unknown> | null;
}

// ============================================================================
// Appointment Booking Types
// ============================================================================

export type ServiceType =
  | "wash"
  | "groom"
  | "nail_trim"
  | "full_service"
  | "other";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type BookingMethod = "form" | "voice" | "phone" | "walk_in";

export interface Appointment {
  id: string;
  dog_id: string | null;
  store_service_id?: string | null;
  pay_deposit_now?: boolean;
  pay_deposit_payment_id?: string | null;
  dog_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email?: string | null;
  service_type: ServiceType;
  date: string;
  time: string;
  duration_minutes: number;
  status: AppointmentStatus;
  notes: string | null;
  booked_via: BookingMethod;
  store_id?: string | null;
  is_charged?: boolean;
  pricing_mode?: 'fixed' | 'price_on_assessment';
  deposit_required_amount?: number;
  deposit_paid_total?: number;
  is_deposit_paid?: boolean;
  email_sent_to?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceBookingParseResult {
  parsed: boolean;
  confidence: number;
  data: Partial<Appointment>;
  original_text: string;
  missing_fields: string[];
}

export interface TimeSlot {
  time: string;
  available: boolean;
  service_type?: string;
  remaining_capacity?: number;
  reason?: string;
}

// ============================================================================
// Product & Order Types
// ============================================================================

export type ProductCategory =
  | "grooming"
  | "treats"
  | "accessories"
  | "beds"
  | "toys"
  | "health"
  | "supplies"
  | "other";

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  price: number;
  stock_quantity: number;
  image_url: string | null;
  image_urls?: string[] | null;
  pack_options?: Array<{
    id: string;
    label: string;
    price: number;
    stock_quantity: number;
    image_url?: string | null;
  }> | null;
  selected_pack_option_id?: string | null;
  selected_pack_option_label?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "ready"
  | "completed"
  | "cancelled";

export interface OrderItem {
  id?: number;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface ShippingAddress {
  recipient_name?: string;
  label?: string | null;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export type ShippingMethod = 'ground' | 'expedited_2day' | 'overnight_1day';
export interface ShippingMethodOption {
  method: ShippingMethod;
  label: string;
  fee: number;
}
export interface ShippingPolicyConfig {
  ground_free_threshold: number;
  methods: ShippingMethodOption[];
}

export interface SavedShippingAddress extends ShippingAddress {
  id: string;
  user_id: string;
  recipient_name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email?: string | null;
  status: OrderStatus;
  subtotal?: number;
  discount_amount?: number;
  discount_reason?: string | null;
  business_member_id?: string | null;
  business_membership_id?: string | null;
  points_awarded?: number;
  tax_amount?: number;
  shipping_method?: ShippingMethod | null;
  shipping_fee?: number;
  total: number;
  notes: string | null;
  shipping_address?: ShippingAddress | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export type OrderReturnReasonType = 'non_quality' | 'quality_issue';
export type OrderReturnStatus =
  | 'return_requested'
  | 'return_under_review'
  | 'return_approved'
  | 'return_rejected'
  | 'return_received'
  | 'refund_pending'
  | 'refund_completed';

export interface OrderReturnRequest {
  id: string;
  order_id: string;
  user_id: string;
  store_id?: string | null;
  reason_type: OrderReturnReasonType;
  reason_text: string | null;
  evidence_urls?: string[] | null;
  status: OrderReturnStatus;
  manager_note?: string | null;
  approved_by_user_id?: string | null;
  approved_at?: string | null;
  received_at?: string | null;
  refund_amount?: number | null;
  refund_reference?: string | null;
  refunded_at?: string | null;
  created_at: string;
  updated_at: string;
  order_status?: OrderStatus;
  order_total?: number;
  customer_name?: string | null;
  customer_email?: string | null;
}

export interface CartItem {
  cart_key: string;
  product: Product;
  quantity: number;
}

// ============================================================================
// Payment Types
// ============================================================================

export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export interface Payment {
  id: string;
  order_id: string;
  stripe_payment_intent_id: string | null;
  provider?: 'stripe' | 'square' | null;
  provider_payment_id?: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: string | null;
  receipt_url: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentConfig {
  provider: 'square' | 'stripe' | 'none';
  publishable_key: string;
  stripe_enabled: boolean;
  square_enabled?: boolean;
  square_application_id?: string;
  square_location_id?: string;
  paypal_enabled?: boolean;
  paypal_client_id?: string;
  paypal_environment?: string;
  currency: string;
  environment?: string;
}

export interface PaymentIntent {
  client_secret: string;
  payment_intent_id: string;
  payment_id: string;
  amount: number;
  currency: string;
}

// ============================================================================
// Auth Types
// ============================================================================

export type UserRole = 'admin' | 'owner' | 'customer' | 'store_manager' | 'staff' | 'business_member';

export interface User {
  id: string;
  email: string;
  email_verified_at?: string | null;
  name: string;
  phone_number?: string | null;
  avatar_url?: string | null;
  default_shipping_address?: ShippingAddress | null;
  notification_email_enabled?: boolean;
  notification_sms_enabled?: boolean;
  role: UserRole;
  store_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token?: string;
  user?: User;
  challenge_required?: boolean;
  challenge_type?: 'email_code' | string;
  challenge_id?: string;
  expires_at?: string;
  email_verification_required?: boolean;
  verification_challenge_id?: string;
  verification_expires_at?: string;
  message?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
  store_id?: string;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  store_open_hour?: string | number | null;
  store_close_hour?: string | number | null;
  max_concurrent_appointments?: string | number | null;
  appointment_slot_minutes?: string | number | null;
  appointment_max_active_per_customer?: string | number | null;
  appointment_max_new_per_day?: string | number | null;
  appointment_max_new_per_7d?: string | number | null;
  appointment_min_hours_between?: string | number | null;
  appointment_service_enabled_wash?: string | number | null;
  appointment_service_enabled_groom?: string | number | null;
  appointment_service_enabled_nail_trim?: string | number | null;
  appointment_service_enabled_full_service?: string | number | null;
  appointment_service_enabled_other?: string | number | null;
  appointment_service_max_concurrent_wash?: string | number | null;
  appointment_service_max_concurrent_groom?: string | number | null;
  appointment_service_max_concurrent_nail_trim?: string | number | null;
  appointment_service_max_concurrent_full_service?: string | number | null;
  appointment_service_max_concurrent_other?: string | number | null;
  service_price_wash?: string | number | null;
  service_price_groom?: string | number | null;
  service_price_nail_trim?: string | number | null;
  service_price_full_service?: string | number | null;
  service_price_other?: string | number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserStoreAssignment {
  user_id: string;
  store_ids: string[];
  stores: Array<{
    store_id: string;
    store_name: string;
    slug: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
}

// ============================================================================
// Business Membership
// ============================================================================

export interface BusinessMembership {
  id: string;
  user_id: string;
  code: string;
  display_name: string;
  discount_percent: number;
  max_discount_amount: number;
  monthly_usage_limit: number;
  points_multiplier_referral: number;
  points_multiplier_self: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  points_balance: number;
  created_at: string;
  updated_at: string;
}

export interface BusinessMembershipCodePreview {
  id: string;
  code: string;
  display_name: string;
  discount_percent: number;
  max_discount_amount: number;
  monthly_usage_limit: number;
}

export interface BusinessMembershipBindResult {
  id: string;
  customer_user_id: string;
  business_membership_id: string;
  is_active: boolean;
  linked_at: string;
  unlinked_at: string | null;
  linked_by_user_id: string | null;
  notes: string | null;
  code?: string;
  display_name?: string;
}

export interface BusinessCustomerActivity {
  appointments: Appointment[];
  orders: Order[];
}

export interface CustomerBusinessLink {
  id: string;
  customer_user_id: string;
  business_membership_id: string;
  is_active: boolean;
  linked_at: string;
  unlinked_at: string | null;
  linked_by_user_id: string | null;
  notes: string | null;
}

export interface DiscountBreakdown {
  subtotal: number;
  discount_amount: number;
  final_total: number;
  discount_reason: string | null;
  business_membership_id: string | null;
}

export interface ServicePrice {
  id: string;
  service_type: ServiceType;
  base_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppointmentCharge {
  id: string;
  appointment_id: string;
  user_id: string | null;
  business_membership_id: string | null;
  service_type: ServiceType;
  base_price: number;
  discount_amount: number;
  final_price: number;
  points_awarded: number;
  status: 'charged' | 'refunded';
  appointment_date?: string;
  appointment_time?: string;
  dog_name?: string;
  customer_name?: string;
  business_code?: string | null;
  business_display_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentDeposit {
  id: string;
  appointment_id: string;
  user_id: string | null;
  amount: number;
  status: 'charged' | 'refunded';
  note: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deposit_paid_total?: number;
}

export interface BusinessPointsLedgerEntry {
  id: number;
  business_membership_id: string;
  customer_user_id: string | null;
  customer_name?: string | null;
  order_id: string | null;
  appointment_charge_id: string | null;
  source_type: string;
  points_delta: number;
  memo: string | null;
  created_at: string;
}

export interface BusinessMembershipApplication {
  id: string;
  user_id: string;
  applicant_name: string;
  applicant_phone: string | null;
  shop_name: string | null;
  city: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by_user_id: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackItem {
  id: string;
  user_id: string;
  category: 'general' | 'bug' | 'improvement' | 'feature' | 'other';
  message: string;
  status: 'new' | 'reviewed' | 'resolved';
  admin_note: string | null;
  user_name?: string | null;
  user_email?: string | null;
  user_role?: UserRole | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Store Service Catalog, Memberships & Promotions
// All monetary values are integers in cents (e.g. $30.00 = 3000).
// ============================================================================

/**
 * A size variant for services where price depends on dog size (e.g. grooming).
 * All prices in cents.
 */
export interface ServiceSizeVariant {
  label: string;                      // e.g. "XS", "SM", "MD", "LG", "XL", "XXL"
  base_price_cents: number;
  member_price_cents: number | null;  // null = free for members
}

/**
 * A bookable service in a store's catalog.
 * Richer replacement for the flat service_price_* fields on Store.
 * The flat Store fields remain for backward-compatible slot-availability checks;
 * this type carries the full display/pricing info.
 * All prices in cents.
 */
export interface StoreService {
  id: string;
  store_id: string;
  service_type: ServiceType;          // links to existing booking ServiceType
  name: string;                       // e.g. "Self-Service Dog Wash (VIP Room)"
  description: string | null;
  base_price_cents: number | null;    // null when price_on_assessment is true
  member_price_cents: number | null;  // null = free for members
  price_on_assessment: boolean;       // true → show "Price confirmed on site" instead of a number
  deposit_required: boolean;
  deposit_amount_cents: number | null;
  size_variants: ServiceSizeVariant[]; // empty array if not applicable
  duration_minutes: number | null;
  requires_prior_session: boolean;    // e.g. treadmill requires a prior training session
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * A customer membership plan offered by a store.
 * All prices in cents.
 */
export interface StoreMembershipPlan {
  id: string;
  store_id: string;
  name: string;                          // e.g. "Dog Wash Monthly"
  description: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number | null;     // null = no yearly option available
  included_service_types: ServiceType[]; // these service types are free/unlimited for members
  perks: string[];                       // free-text lines shown on the plan card
  is_highlighted: boolean;              // renders a "Most Popular" badge
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * A user's active subscription to a store membership plan.
 * dog_id null  = account-level (applies to all dogs under the account).
 * dog_id set   = per-dog membership (applies to one dog only).
 */
export interface UserMembership {
  id: string;
  user_id: string;
  dog_id: string | null;              // null = account-level; non-null = per-dog
  store_id: string;
  plan_id: string;
  plan_name?: string;                 // denormalized for display
  status: 'active' | 'cancelled' | 'expired';
  started_at: string;
  expires_at: string | null;          // null = ongoing (cancel-anytime)
  created_at: string;
  updated_at: string;
}

export type PromotionType = 'pct_off' | 'fixed_off' | 'free_service' | 'info';
export type PromotionEligibility = 'all' | 'members_only' | 'new_customers';

/**
 * A time-limited promotion or deal offered by a store.
 * All monetary values in cents.
 */
export interface Promotion {
  id: string;
  store_id: string;
  title: string;
  description: string | null;
  type: PromotionType;
  /** pct_off only: integer 0–100. */
  discount_percent: number | null;
  /** fixed_off only: amount off in cents. */
  discount_value_cents: number | null;
  /** pct_off only: caps the maximum saving in cents. null = uncapped. */
  max_discount_cents: number | null;
  /** Service IDs this applies to. Empty array = all active services. */
  applies_to_service_ids: string[];
  eligibility: PromotionEligibility;
  coupon_code: string | null;         // null = auto-applied (no code required)
  is_stackable: boolean;              // can combine with other promotions
  /** Higher number = evaluated first when multiple promotions apply. */
  priority: number;
  usage_limit_total: number | null;   // null = unlimited
  usage_limit_per_user: number | null; // null = unlimited per user
  valid_from: string;                 // ISO datetime
  valid_until: string;                // ISO datetime
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A promotion coupon claimed by a user. */
export interface UserCoupon {
  id: string;
  user_id: string;
  promotion_id: string;
  store_id: string;
  coupon_code: string | null;
  claimed_at: string;
  used_at: string | null;
  expires_at: string | null;
  status: 'available' | 'used' | 'expired';
  promotion_title?: string;           // denormalized for display
}

// ============================================================================
// Social Types (V1)
// ============================================================================

export type MessagePrivacy = 'everyone' | 'followers_only' | 'nobody';
export type ProfileVisibility = 'public' | 'followers_only' | 'private';
export type FollowStatus = 'active' | 'requested' | 'none';

/** Social-safe user profile — never includes email/phone */
export interface SocialUserProfile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  /** Relationship from the requesting user's perspective */
  followStatus: FollowStatus;
  /** True when viewer and target actively follow each other */
  isMutualFollow?: boolean;
  isBlockedByMe: boolean;
}

export interface SocialSettings {
  messagePrivacy: MessagePrivacy;
  profileVisibility: ProfileVisibility;
  dogProfileVisibility: ProfileVisibility;
  isMessagingEnabled: boolean;
}

export interface SocialThread {
  id: string;
  type: 'direct' | 'group';
  otherUser: SocialUserProfile;       // V1: direct only
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isMuted: boolean;
  isPinned?: boolean;
  createdAt: string;
}

export interface SocialTypingUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  updatedAt: string | null;
}

export interface SocialPostMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  thumbnailUrl: string | null;
  sortOrder: number;
}

export interface SocialPost {
  id: string;
  userId: string;
  storeId: string;
  content: string | null;
  visibility: 'public' | 'followers' | 'private';
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
  likedByMe: boolean;
  author: SocialUserProfile | null;
  media: SocialPostMedia[];
}

export interface SocialComment {
  id: string;
  postId: string;
  userId: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeleted: boolean;
  author: SocialUserProfile | null;
}

export interface SocialNotification {
  id: string;
  type:
    | 'like'
    | 'comment'
    | 'follow'
    | 'follow_accepted'
    | 'message'
    | 'meetup_request_received'
    | 'meetup_request_approved'
    | 'meetup_request_rejected'
    | 'meetup_attendee_joined'
    | 'meetup_cancelled';
  userId: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  objectType: 'post' | 'comment' | 'thread' | 'follow' | 'meetup' | null;
  objectId: string | null;
  payload: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
}

export interface SocialMessage {
  id: string;
  threadId: string;
  senderUserId: string;
  messageType: 'text' | 'image' | 'system';
  body: string | null;
  mediaUrl: string | null;
  clientMsgId: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;         // non-null → tombstone, body omitted
}

export interface FollowRequest {
  id: string;
  followerUserId: string;
  followerProfile: SocialUserProfile;
  createdAt: string;
}

export interface SocialUnreadCount {
  unreadCount: number;
  enabled: boolean;                  // false when FEATURE_DISABLED
}

export interface SocialPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Computed price breakdown returned by the pricing engine.
 * Shown in the booking confirmation and receipt.
 * All values in cents.
 */
export interface PriceBreakdown {
  base_price_cents: number;
  size_variant_label: string | null;  // e.g. "MD" — set when user selected a size
  member_discount_cents: number;      // 0 if user has no active membership
  promo_discount_cents: number;       // 0 if no promotion applied
  final_price_cents: number;
  is_price_on_assessment: boolean;    // true → render "Price confirmed on site"
  applied_promotion_id: string | null;
  applied_coupon_id: string | null;
  member_price_note: string | null;   // e.g. "Member price applied (Dog Wash Monthly)"
}

// ============================================================================
// UnforgettableRides Domain Types
// ============================================================================

export type CarTag = 'wedding' | 'photoshoot' | 'event' | 'other';
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type QuoteStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export interface CarImage {
  id: string;
  car_id: string;
  url: string;
  is_primary: boolean | number;
  sort_order: number;
  created_at?: string;
}

export interface ClassicCar {
  id: string;
  owner_id: string;
  owner?: Partial<User>;
  make: string;
  model: string;
  year: number;
  color: string;
  description?: string;
  tags: CarTag[] | string;
  price_per_hour_cents?: number;
  price_per_day_cents?: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  available_for_hire: boolean | number;
  is_active: boolean | number;
  images?: CarImage[];
  primary_image_url?: string;
  average_rating?: number;
  review_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  car_id: string;
  car?: Partial<ClassicCar>;
  customer_id: string;
  customer?: Partial<User>;
  event_type: CarTag;
  event_date: string;
  duration_hours?: number;
  duration_days?: number;
  pickup_location?: string;
  notes?: string;
  status: BookingStatus;
  total_price_cents?: number;
  price_breakdown?: string;
  stripe_payment_intent_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  car_id: string;
  car?: Partial<ClassicCar>;
  customer_id: string;
  message: string;
  proposed_price_cents?: number;
  event_type?: CarTag;
  event_date?: string;
  status: QuoteStatus;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  car_id: string;
  booking_id?: string;
  reviewer_id: string;
  reviewer?: Partial<User>;
  rating: number;
  text?: string;
  photo_urls: string[];
  is_active: boolean | number;
  created_at: string;
}

export interface Payout {
  id: string;
  owner_id: string;
  owner?: Partial<User>;
  amount_cents: number;
  currency: string;
  period_start?: string;
  period_end?: string;
  status: PayoutStatus;
  stripe_transfer_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

