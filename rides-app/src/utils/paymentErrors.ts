export function toReadablePaymentError(raw?: string): string {
  const message = String(raw || '').trim();
  if (!message) return 'Payment failed. Please try again.';

  const upper = message.toUpperCase();
  const hasCode = (code: string) => upper.includes(code);

  if (
    hasCode('PAN_FAILURE')
    || hasCode('CARD_DECLINED')
    || hasCode('GENERIC_DECLINE')
    || upper.includes('AUTHORIZATION ERROR')
  ) {
    return `Card was declined. Please try another card or contact your bank.\n\nDetails: ${message}`;
  }
  if (hasCode('CVV_FAILURE')) {
    return `Security code (CVV) check failed. Please verify the card details and try again.\n\nDetails: ${message}`;
  }
  if (hasCode('EXPIRATION_FAILURE')) {
    return `Card expiration date is invalid. Please check and try again.\n\nDetails: ${message}`;
  }
  if (hasCode('ADDRESS_VERIFICATION_FAILURE')) {
    return `Billing address verification failed. Please verify your address and try again.\n\nDetails: ${message}`;
  }
  if (hasCode('INSUFFICIENT_FUNDS')) {
    return `Insufficient funds. Please use another card or contact your bank.\n\nDetails: ${message}`;
  }
  if (hasCode('AUTHENTICATION_REQUIRED')) {
    return `Additional card authentication is required. Please retry and complete verification.\n\nDetails: ${message}`;
  }
  if (hasCode('INVALID_CARD')) {
    return `Card details are invalid. Please verify and try again.\n\nDetails: ${message}`;
  }

  return `Payment failed. Please try again.\n\nDetails: ${message}`;
}
