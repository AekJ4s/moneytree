import type { Creditor, DebtPayment } from './types';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Minimum payment: the fixed amount if set, else the percentage of the balance; never more than owed. */
export function minimumPayment(c: Pick<Creditor, 'balance' | 'min_payment' | 'min_payment_percent'>): number {
  const balance = Number(c.balance);
  if (balance <= 0) return 0;
  const minimum =
    c.min_payment != null ? Number(c.min_payment) : c.min_payment_percent != null ? (balance * Number(c.min_payment_percent)) / 100 : 0;
  return round2(Math.min(balance, minimum));
}

/** Payments to this creditor in the calendar month of `today`. */
export function paidThisMonth(creditorId: string, payments: DebtPayment[], today: string): number {
  const month = today.slice(0, 7);
  return round2(
    payments.filter((p) => p.creditor_id === creditorId && p.paid_on.slice(0, 7) === month).reduce((s, p) => s + Number(p.amount), 0),
  );
}

/** This month's due date (the due day, clamped to short months). */
export function dueDateThisMonth(dueDay: number | null, today: string): string | null {
  if (!dueDay) return null;
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${today.slice(0, 8)}${String(Math.min(dueDay, last)).padStart(2, '0')}`;
}

export interface CreditorStatus {
  creditor: Creditor;
  minimum: number;
  paid: number;
  /** Still to pay this month to cover the minimum (รอจ่าย). */
  remaining: number;
  dueDate: string | null;
  overdue: boolean;
  /** Credit still available, when a credit line is set. */
  available: number | null;
}

export function creditorStatus(creditor: Creditor, payments: DebtPayment[], today: string): CreditorStatus {
  const minimum = minimumPayment(creditor);
  const paid = paidThisMonth(creditor.id, payments, today);
  const remaining = round2(Math.max(0, minimum - paid));
  const dueDate = dueDateThisMonth(creditor.due_day, today);
  return {
    creditor,
    minimum,
    paid,
    remaining,
    dueDate,
    overdue: remaining > 0 && !!dueDate && dueDate < today,
    available: creditor.credit_limit != null ? round2(Number(creditor.credit_limit) - Number(creditor.balance)) : null,
  };
}

export interface DebtTotals {
  /** หนี้รวม */
  owed: number;
  /** Sum of minimum payments this month. */
  minimum: number;
  paid: number;
  /** What still has to be paid this month (รอจ่าย). */
  remaining: number;
}

export function debtTotals(statuses: CreditorStatus[]): DebtTotals {
  const sum = (f: (s: CreditorStatus) => number) => round2(statuses.reduce((t, s) => t + f(s), 0));
  return {
    owed: sum((s) => Number(s.creditor.balance)),
    minimum: sum((s) => s.minimum),
    paid: sum((s) => s.paid),
    remaining: sum((s) => s.remaining),
  };
}
