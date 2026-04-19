import type { Language } from '../i18n/translations';

export function getCurrencyForLang(lang: Language): 'USD' | 'CNY' {
  return lang === 'zh' ? 'CNY' : 'USD';
}

/**
 * Format an amount as a locale-aware currency string.
 * @param amount - value in major units (e.g. dollars, not cents)
 */
export function formatCurrencyByLang(lang: Language, amount: number): string {
  const currency = getCurrencyForLang(lang);
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${currency} ${safeAmount.toFixed(2)}`;
  }
}

/** Convert cents (integer) to major currency units for display. */
export function centsToMajor(cents: number): number {
  return (Number.isFinite(cents) ? cents : 0) / 100;
}

