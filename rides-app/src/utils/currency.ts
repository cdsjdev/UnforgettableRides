const FALLBACK_CURRENCY = 'USD';
let defaultCurrency = FALLBACK_CURRENCY;

function normalizeCurrencyCode(currency?: string): string {
  const value = String(currency || '').trim().toUpperCase();
  return value || FALLBACK_CURRENCY;
}

export function setDefaultCurrency(currency?: string): void {
  defaultCurrency = normalizeCurrencyCode(currency);
}

export function getDefaultCurrency(): string {
  return defaultCurrency;
}

export function formatCurrency(amount: number, currency = defaultCurrency, locale = 'en-US'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const normalizedCurrency = normalizeCurrencyCode(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${normalizedCurrency} ${safeAmount.toFixed(2)}`;
  }
}

export function getCurrencyForLanguage(lang?: string): string {
  return 'USD';
}

export function getLocaleForLanguage(lang?: string): string {
  return 'en-US';
}
