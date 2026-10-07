import { describe, expect, it } from 'vitest';
import { buildSchedule, monthlyRate, summarizeDebt } from './debtMath';
import type { Debt, DebtEntry, DebtInstallment } from './types';

describe('monthlyRate', () => {
  it('converts annual and monthly percentages', () => {
    expect(monthlyRate('annual', 12)).toBeCloseTo(0.01);
    expect(monthlyRate('monthly', 1.5)).toBeCloseTo(0.015);
    expect(monthlyRate('manual', 5)).toBe(0);
    expect(monthlyRate('none', null)).toBe(0);
  });
});

describe('buildSchedule', () => {
  it('flat rate: equal principal + interest on the original amount', () => {
    const rows = buildSchedule({
      principal: 10000,
      termMonths: 3,
      interestMode: 'monthly',
      interestRate: 1,
      interestMethod: 'flat',
      firstDueDate: '2026-10-31',
    });
    expect(rows).toEqual([
      { seq: 1, due_date: '2026-10-31', principal: 3333.33, interest: 100 },
      { seq: 2, due_date: '2026-11-30', principal: 3333.33, interest: 100 },
      { seq: 3, due_date: '2026-12-31', principal: 3333.34, interest: 100 },
    ]);
  });

  it('reducing balance: equal payments, principals sum to the loan', () => {
    const rows = buildSchedule({
      principal: 12000,
      termMonths: 12,
      interestMode: 'annual',
      interestRate: 12,
      interestMethod: 'reducing',
      firstDueDate: '2026-11-05',
    });
    const principalSum = rows.reduce((s, r) => s + r.principal, 0);
    expect(principalSum).toBeCloseTo(12000, 2);
    expect(rows[0].interest).toBe(120); // 1% of 12,000
    // Standard amortisation payment for 12,000 @1%/mo over 12 months is 1,066.19.
    expect(rows[0].principal + rows[0].interest).toBeCloseTo(1066.19, 2);
    expect(rows[11].principal + rows[11].interest).toBeCloseTo(1066.19, 0);
    expect(rows[11].due_date).toBe('2027-10-05');
  });

  it('0% / manual interest splits principal only', () => {
    const rows = buildSchedule({
      principal: 1000,
      termMonths: 3,
      interestMode: 'manual',
      interestRate: null,
      interestMethod: 'flat',
      firstDueDate: '2026-10-10',
    });
    expect(rows.map((r) => [r.principal, r.interest])).toEqual([
      [333.33, 0],
      [333.33, 0],
      [333.34, 0],
    ]);
  });
});

const baseDebt: Debt = {
  id: 'd1',
  creditor_id: 'c1',
  name: 'test',
  kind: 'installment',
  principal: 3000,
  interest_mode: 'none',
  interest_rate: null,
  interest_method: 'flat',
  term_months: 3,
  start_date: '2026-09-01',
  first_due_date: '2026-09-25',
  due_day: null,
  credit_limit: null,
  min_payment_percent: null,
  closed_on: null,
  note: null,
  created_at: '',
};

function inst(seq: number, due_date: string, principal: number, interest = 0): DebtInstallment {
  return { id: `i${seq}`, debt_id: 'd1', seq, due_date, principal, interest };
}

function entry(kind: DebtEntry['kind'], amount: number, installment_id: string | null = null): DebtEntry {
  return { id: `e${Math.random()}`, debt_id: 'd1', installment_id, kind, amount, entry_date: '2026-10-01', note: null, transaction_id: null, created_at: '' };
}

describe('summarizeDebt', () => {
  const installments = [inst(1, '2026-09-25', 1000, 50), inst(2, '2026-10-25', 1000, 50), inst(3, '2026-11-25', 1000, 50)];

  it('installments: remaining, next due, overdue and this month', () => {
    const s = summarizeDebt(baseDebt, installments, [], '2026-10-07');
    expect(s).toMatchObject({
      outstanding: 3150,
      remainingPrincipal: 3000,
      remainingInterest: 150,
      totalInterest: 150,
      paidCount: 0,
      totalCount: 3,
      nextDue: { date: '2026-09-25', amount: 1050, installmentId: 'i1' },
      dueThisMonth: 2100, // overdue September + October
      overdueCount: 1,
    });
  });

  it('installments: paid ones drop out', () => {
    const s = summarizeDebt(baseDebt, installments, [entry('payment', 1050, 'i1')], '2026-10-07');
    expect(s).toMatchObject({ outstanding: 2100, paidCount: 1, dueThisMonth: 1050, overdueCount: 0 });
    expect(s.nextDue?.installmentId).toBe('i2');
  });

  it('installments: fees and extra interest outside the schedule count towards the balance', () => {
    const s = summarizeDebt(baseDebt, installments, [entry('fee', 30), entry('interest', 20)], '2026-10-07');
    expect(s).toMatchObject({ outstanding: 3200, totalInterest: 170 });
  });

  it('revolving: balance, interest estimate, minimum payment, utilization', () => {
    const debt: Debt = {
      ...baseDebt,
      kind: 'revolving',
      principal: 20000,
      interest_mode: 'annual',
      interest_rate: 16,
      due_day: 20,
      credit_limit: 50000,
      min_payment_percent: 8,
    };
    const s = summarizeDebt(debt, [], [entry('charge', 5000), entry('interest', 300), entry('payment', 5300)], '2026-10-07');
    expect(s).toMatchObject({
      outstanding: 20000,
      estimatedMonthlyInterest: 266.67,
      minimumPayment: 1600,
      utilization: 0.4,
      nextDue: { date: '2026-10-20', amount: 1600, installmentId: null },
      dueThisMonth: 1600,
      totalInterest: 300,
    });
  });
});
