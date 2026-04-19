import { useCallback, useSyncExternalStore } from 'react';

type ThemeValue = 'light' | 'dark';

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getStoredTheme(): ThemeValue | null {
  if (!canUseDom()) return null;
  try {
    const stored = window.localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // ignore storage access failures
  }
  return null;
}

function getPreferredTheme(): ThemeValue {
  if (!canUseDom()) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ThemeValue): void {
  if (!canUseDom()) return;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    if (window.localStorage.getItem('theme') !== theme) {
      window.localStorage.setItem('theme', theme);
    }
  } catch {
    // ignore storage access failures
  }
}

const listeners = new Set<() => void>();
let currentTheme: ThemeValue = getStoredTheme() ?? getPreferredTheme();
applyTheme(currentTheme);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ThemeValue {
  return currentTheme;
}

function setTheme(next: ThemeValue): void {
  if (next === currentTheme) return;
  currentTheme = next;
  applyTheme(currentTheme);
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const dark = theme === 'dark';
  const toggle = useCallback(() => setTheme(dark ? 'light' : 'dark'), [dark]);
  return { dark, toggle };
}
