import type { DebtWithSummary } from '../debts/debtMath';
import type { Creditor } from '../debts/types';

export interface PayableItem {
  debtId: string;
  creditorId: string;
  label: string;
  borrower: string | null;
  /** Due by the end of this month (including anything overdue and unpaid). */
  dueThisMonth: number;
  dueNextMonth: number;
  /** Everything still owed on this debt (card balance incl. billed interest, or remaining principal). */
  owed: number;
  next: { date: string; amount: number } | null;
  overdue: boolean;
}

export interface Payables {
  items: PayableItem[];
  /** รอจ่าย: what has to be paid this month. */
  thisMonth: number;
  nextMonth: number;
  /** All debt still owed, for reference only. */
  totalOwed: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * What I have to pay (รอจ่าย). Only amounts due this month count: a card bill already paid drops out,
 * and the next statement is counted next month. Items are ordered by their next due date.
 */
export function buildPayables(open: DebtWithSummary[], creditors: Creditor[]): Payables {
  const names = new Map(creditors.map((c) => [c.id, c.name]));
  const items = open
    .map(({ debt, summary }) => ({
      debtId: debt.id,
      creditorId: debt.creditor_id,
      label: `${names.get(debt.creditor_id) ?? ''} · ${debt.name}`,
      borrower: debt.borrower,
      dueThisMonth: summary.dueThisMonth,
      dueNextMonth: summary.dueNextMonth,
      owed: debt.kind === 'revolving' ? summary.outstanding : summary.remainingPrincipal,
      next: summary.nextDue ? { date: summary.nextDue.date, amount: summary.nextDue.amount } : null,
      overdue: summary.overdueCount > 0,
    }))
    .filter((i) => i.owed > 0)
    .sort((a, b) => (a.next?.date ?? '9999').localeCompare(b.next?.date ?? '9999'));
  return {
    items,
    thisMonth: round2(items.reduce((s, i) => s + i.dueThisMonth, 0)),
    nextMonth: round2(items.reduce((s, i) => s + i.dueNextMonth, 0)),
    totalOwed: round2(items.reduce((s, i) => s + i.owed, 0)),
  };
}

/** Real balance adjusted for what will come in and what has to go out this month. */
export function projectedBalance(cash: number, receivable: number, payableThisMonth: number): number {
  return round2(cash + receivable - payableThisMonth);
}
