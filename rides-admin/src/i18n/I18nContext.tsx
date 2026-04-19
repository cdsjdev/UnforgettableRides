import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translations, type Language } from './translations';

type I18nContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'web_lang';

function initialLang(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'zh') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(initialLang);

  const setLang = (next: Language) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const t = (key: string, vars?: Record<string, string | number>) => {
    const base = translations[lang][key] ?? translations.en[key] ?? key;
    if (!vars) return base;
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      base
    );
  };

  const value = useMemo(() => ({ lang, setLang, t }), [lang]);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang === 'zh' ? 'zh-CN' : 'en';
    html.setAttribute('data-lang', lang);
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

