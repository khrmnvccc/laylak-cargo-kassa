// Helpers for "Chek orqali": the receipt and orders screenshots are read on the cashier's own
// device (free OCR in the browser); the server only checks and saves what was read.

/** "TTT-102315" -> "102315": the kassa keeps one ID per client; the letters only say which warehouse/route. */
export function clientCodeOf(code: string | null | undefined): string {
  const raw = String(code || '').toUpperCase().replace(/\s+/g, '');
  const digits = raw.match(/\d{3,}/g);
  if (digits) return digits[digits.length - 1];
  return raw.replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

/** Key that recognises the same receipt again: the bank's transaction number, else amount + time + card. */
export function receiptKey(r: { transactionId?: string | null; amount?: number | null; paidAt?: string | null; senderCard?: string | null }): string | null {
  const txn = String(r.transactionId || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (txn.length >= 4) return `txn:${txn}`;
  if (r.amount && r.paidAt) return `sum:${r.amount}|${r.paidAt}|${String(r.senderCard || '').replace(/\D/g, '').slice(-4)}`;
  return null;
}
