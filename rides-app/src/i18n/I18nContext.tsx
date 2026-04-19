import React, { createContext, useContext, useCallback } from 'react';
import { translations } from './translations';

interface I18nContextType {
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({ t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    let str = translations.en[key] || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{${k}}`, String(v)); });
    }
    return str;
  }, []);

  return <I18nContext.Provider value={{ t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
