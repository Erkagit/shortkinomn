import { randomUUID } from 'node:crypto';
import { execute, one, transaction } from './db.js';
import { HttpError } from './auth.js';
import type { Movie } from './catalog.js';

export interface PaymentProvider {
  name: string;
  instructions: string;
  createInvoice(input: { purchaseId: string; amount: number; currency: 'MNT' }): { id: string; amount: number };
  verifyReceipt(input: { transactionId: string; reviewerId: string; amount: number }): { transactionId: string };
}
/** Manual provider: a human checks the bank statement; clients cannot assert payment success.
 * A gateway adapter must independently verify signature, merchant invoice, MNT currency and amount.
 */
export const paymentProvider: PaymentProvider = {
  name: 'MANUAL', instructions: process.env.PAYMENT_INSTRUCTIONS || '',
  createInvoice({ amount }) { return { id: randomUUID(), amount }; },
  verifyReceipt({ transactionId, reviewerId }) {
    if (!one("SELECT id FROM users WHERE id=? AND role='ADMIN'", reviewerId) || !transactionId.trim()) throw new HttpError(403, 'Төлбөр баталгаажуулах эрхгүй байна.');
    return { transactionId: transactionId.trim() };
  },
};
export function checkout(userId: string, movie: Movie) {
  if (!paymentProvider.instructions) throw new HttpError(503, 'Төлбөрийн үйлчилгээ хараахан нээгдээгүй байна.');
  return transaction(() => {
    const existing = one<{ id: string; status: string }>('SELECT id,status FROM purchases WHERE user_id=? AND movie_id=?', userId, movie.id);
    if (existing) return existing;
    const id = randomUUID();
    const invoice = paymentProvider.createInvoice({ purchaseId: id, amount: movie.price, currency: 'MNT' });
    execute('INSERT INTO purchases(id,user_id,movie_id,amount) VALUES(?,?,?,?)', id, userId, movie.id, movie.price);
    execute('INSERT INTO payments(id,user_id,purchase_id,provider,amount) VALUES(?,?,?,?,?)', invoice.id, userId, id, paymentProvider.name, invoice.amount);
    return { id, status: 'PENDING' };
  });
}
export function settle(paymentId: string, adminId: string, transactionId: string) {
  return transaction(() => {
    const payment = one<{ purchase_id: string; status: string; amount: number }>('SELECT purchase_id,status,amount FROM payments WHERE id=?', paymentId);
    if (!payment) throw new HttpError(404, 'Төлбөр олдсонгүй.');
    if (payment.status === 'PAID') return;
    if (payment.status !== 'PENDING') throw new HttpError(409, 'Төлбөрийн төлөв тохирохгүй байна.');
    const verified = paymentProvider.verifyReceipt({ transactionId, reviewerId: adminId, amount: payment.amount });
    execute("UPDATE payments SET status='PAID',transaction_id=?,verified_by=? WHERE id=?", verified.transactionId, adminId, paymentId);
    execute("UPDATE purchases SET status='PAID' WHERE id=?", payment.purchase_id);
  });
}
