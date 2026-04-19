import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_DOGS_KEY = '@rides_guest_saved_dogs';
const MAX_GUEST_DOGS = 20;
const listeners = new Set<() => void>();

export type GuestSavedDog = {
  id: string;
  name: string;
  breed: string;
  photo_uri?: string;
  traits?: any;
  created_at: string;
};

export async function getGuestSavedDogs(): Promise<GuestSavedDog[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_DOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveGuestDog(dog: Omit<GuestSavedDog, 'id' | 'created_at'>): Promise<GuestSavedDog> {
  const next: GuestSavedDog = {
    ...dog,
    id: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  const existing = await getGuestSavedDogs();
  const updated = [next, ...existing].slice(0, MAX_GUEST_DOGS);
  await AsyncStorage.setItem(GUEST_DOGS_KEY, JSON.stringify(updated));
  listeners.forEach((fn) => fn());
  return next;
}

export async function updateGuestDog(
  dogId: string,
  patch: Partial<Pick<GuestSavedDog, 'name' | 'breed' | 'photo_uri' | 'traits'>>
): Promise<GuestSavedDog | null> {
  const existing = await getGuestSavedDogs();
  const idx = existing.findIndex((d) => d.id === dogId);
  if (idx < 0) return null;
  const updatedDog: GuestSavedDog = {
    ...existing[idx],
    ...patch,
  };
  const next = [...existing];
  next[idx] = updatedDog;
  await AsyncStorage.setItem(GUEST_DOGS_KEY, JSON.stringify(next));
  listeners.forEach((fn) => fn());
  return updatedDog;
}

export function subscribeGuestDogsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

