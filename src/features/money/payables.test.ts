import { describe, expect, it } from 'vitest';
import type { DebtWithSummary } from '../debts/debtMath';
import type { Creditor, Debt } from '../debts/types';
import { buildPayables, projectedBalance } from './payables';

const creditor = (id: string, name: string): Creditor => ({
  id, name, logo: null, sort_order: 0, created_at: '', credit_limit: null, statement_day: null, due_day: null,
});

function item(id: string, kind: Debt['kind'], outstanding: number, remainingPrincipal: number, borrower: string | null = null): DebtWithSummary {
  return {
    debt: { id, creditor_id: 'linebk', name: id, kind, borrower } as Debt,
    summary: {
      outstanding, remainingPrincipal, remainingInterest: 0, totalInterest: 0, paidCount: 0, totalCount: 0,
      nextDue: null, dueThisMonth: 0, overdueCount: 0, estimatedMonthlyInterest: null, minimumPayment: null,
      utilization: null, cycle: null,
    },
  };
}

describe('buildPayables', () => {
  it('owes card balances incl. billed interest, and only the principal of installments', () => {
    const result = buildPayables(
      [
        item('mom', 'revolving', 61399.53, 60000, 'แม่'),
        item('loan', 'installment', 12468.03, 10000),
        item('paid-off', 'revolving', 0, 0),
      ],
      [creditor('linebk', 'LINE BK')],
    );
    expect(result.total).toBe(71399.53);
    expect(result.items.map((i) => [i.label, i.owed])).toEqual([
      ['LINE BK · mom', 61399.53],
      ['LINE BK · loan', 10000],
    ]);
  });
});

describe('projectedBalance', () => {
  it('adds what comes in and subtracts what goes out', () => {
    expect(projectedBalance(15000, 61399.53, 71399.53)).toBe(5000);
  });
});
