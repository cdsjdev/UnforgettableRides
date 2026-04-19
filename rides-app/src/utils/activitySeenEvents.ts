export type ActivitySeenDomain = 'care' | 'dogs';

export type ActivitySeenEvent = {
  domain: ActivitySeenDomain;
  userId: string;
  seenAtMs: number;
};

type Listener = (event: ActivitySeenEvent) => void;

const listeners = new Set<Listener>();

export function emitActivitySeen(event: ActivitySeenEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // isolate listener failures
    }
  });
}

export function subscribeActivitySeen(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
