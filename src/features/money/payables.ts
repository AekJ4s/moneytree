import type { DebtWithSummary } from '../debts/debtMath';
import type { Creditor } from '../debts/types';

export interface PayableItem {
  debtId: string;
  creditorId: string;
  label: string;
  borrower: string | null;
  /** What is owed now: card/credit-line balance incl. billed interest, or remaining installment principal. */
  owed: number;
  next: { date: string; amount: number } | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Everything I still have to pay (รอจ่าย), largest first. Future installment interest is not owed yet. */
export function buildPayables(open: DebtWithSummary[], creditors: Creditor[]): { items: PayableItem[]; total: number } {
  const names = new Map(creditors.map((c) => [c.id, c.name]));
  const items = open
    .map(({ debt, summary }) => ({
      debtId: debt.id,
      creditorId: debt.creditor_id,
      label: `${names.get(debt.creditor_id) ?? ''} · ${debt.name}`,
      borrower: debt.borrower,
      owed: debt.kind === 'revolving' ? summary.outstanding : summary.remainingPrincipal,
      next: summary.nextDue ? { date: summary.nextDue.date, amount: summary.nextDue.amount } : null,
    }))
    .filter((i) => i.owed > 0)
    .sort((a, b) => b.owed - a.owed);
  return { items, total: round2(items.reduce((s, i) => s + i.owed, 0)) };
}

/** Real balance adjusted for what will come in and go out. */
export function projectedBalance(cash: number, receivable: number, payable: number): number {
  return round2(cash + receivable - payable);
}
