function normalizeSquarePaymentStatus(squareStatus) {
  const s = String(squareStatus || '').toUpperCase();
  if (s === 'COMPLETED') return 'succeeded';
  if (s === 'APPROVED' || s === 'PENDING') return 'processing';
  if (s === 'CANCELED') return 'cancelled';
  if (s === 'FAILED') return 'failed';
  return 'pending';
}

function extractSquareErrorMessage(err) {
  const first = err?.errors?.[0];
  if (first?.detail) return String(first.detail);
  if (first?.category && first?.code) return `${first.category}: ${first.code}`;
  if (err?.message) return String(err.message);
  return 'Failed to process payment';
}

module.exports = {
  normalizeSquarePaymentStatus,
  extractSquareErrorMessage,
};
