const USER_API_KEYS_BASE = '@rides_api_keys';
const USER_PREF_BASE = '@rides_preferred_provider';

export function getUserAiStorageKeys(userId: string) {
  return {
    apiKeys: `${USER_API_KEYS_BASE}:${userId}`,
    preferredProvider: `${USER_PREF_BASE}:${userId}`,
  };
}

