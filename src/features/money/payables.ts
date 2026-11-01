import { creditorStatus, debtTotals, type CreditorStatus, type DebtTotals } from '../debts/simpleDebt';
import type { Creditor, DebtPayment } from '../debts/types';

export interface Payables extends DebtTotals {
  /** Creditors with something still to pay this month, soonest due first. */
  due: CreditorStatus[];
}

/** What I still have to pay this month (รอจ่าย): unpaid minimum payments. */
export function buildPayables(creditors: Creditor[], payments: DebtPayment[], today: string): Payables {
  const statuses = creditors.map((c) => creditorStatus(c, payments, today));
  return {
    ...debtTotals(statuses),
    due: statuses
      .filter((s) => s.remaining > 0)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
  };
}

/** Real balance adjusted for what will come in and what has to go out this month. */
export function projectedBalance(cash: number, receivable: number, payableThisMonth: number): number {
  return Math.round((cash + receivable - payableThisMonth + Number.EPSILON) * 100) / 100;
}
