import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVITY_BADGE_SETTINGS_KEY = '@petcare_activity_badge_settings';

export type ActivityBadgeSettings = {
  enabled: boolean;
  socialMessages: boolean;
  socialActivity: boolean;
  careOffers: boolean;
  appointments: boolean;
};

export const DEFAULT_ACTIVITY_BADGE_SETTINGS: ActivityBadgeSettings = {
  enabled: true,
  socialMessages: true,
  socialActivity: true,
  careOffers: true,
  appointments: true,
};

const listeners = new Set<(value: ActivityBadgeSettings) => void>();

function normalize(value: Partial<ActivityBadgeSettings> | null | undefined): ActivityBadgeSettings {
  return {
    enabled: value?.enabled ?? DEFAULT_ACTIVITY_BADGE_SETTINGS.enabled,
    socialMessages: value?.socialMessages ?? DEFAULT_ACTIVITY_BADGE_SETTINGS.socialMessages,
    socialActivity: value?.socialActivity ?? DEFAULT_ACTIVITY_BADGE_SETTINGS.socialActivity,
    careOffers: value?.careOffers ?? DEFAULT_ACTIVITY_BADGE_SETTINGS.careOffers,
    appointments: value?.appointments ?? DEFAULT_ACTIVITY_BADGE_SETTINGS.appointments,
  };
}

export async function getActivityBadgeSettings(): Promise<ActivityBadgeSettings> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITY_BADGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_ACTIVITY_BADGE_SETTINGS;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_ACTIVITY_BADGE_SETTINGS;
  }
}

export async function setActivityBadgeSettings(value: ActivityBadgeSettings): Promise<void> {
  const normalized = normalize(value);
  await AsyncStorage.setItem(ACTIVITY_BADGE_SETTINGS_KEY, JSON.stringify(normalized));
  listeners.forEach((listener) => listener(normalized));
}

export function subscribeActivityBadgeSettings(
  listener: (value: ActivityBadgeSettings) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
