import { describe, expect, it } from 'vitest';
import { summarizeAll } from '../debts/debtMath';
import type { Creditor, Debt, DebtEntry, DebtInstallment } from '../debts/types';
import { buildPayables, projectedBalance } from './payables';

const creditors: Creditor[] = [
  { id: 'ktc', name: 'KTC', logo: null, sort_order: 0, created_at: '', credit_limit: null, statement_day: 24, due_day: 5 },
  { id: 'linebk', name: 'LINE BK', logo: null, sort_order: 0, created_at: '', credit_limit: null, statement_day: null, due_day: 20 },
];

const base: Omit<Debt, 'id' | 'creditor_id' | 'name' | 'kind' | 'principal'> = {
  interest_mode: 'none',
  interest_rate: null,
  interest_method: 'flat',
  term_months: null,
  start_date: '2026-09-24',
  first_due_date: null,
  due_day: null,
  credit_limit: null,
  min_payment_percent: null,
  installment_amount: null,
  borrower: null,
  statement_day: null,
  closed_on: null,
  note: null,
  created_at: '',
};

const card: Debt = { ...base, id: 'card', creditor_id: 'ktc', name: 'บัตรเครดิต', kind: 'revolving', principal: 5000, statement_day: 24, due_day: 5 };
const cash: Debt = { ...base, id: 'mom', creditor_id: 'linebk', name: 'เงินหมุน', kind: 'revolving', principal: 60000, due_day: 20, borrower: 'แม่' };
const loan: Debt = { ...base, id: 'loan', creditor_id: 'linebk', name: 'ผ่อน', kind: 'installment', principal: 3000, term_months: 3 };

const installments: DebtInstallment[] = [
  { id: 'i1', debt_id: 'loan', seq: 1, due_date: '2026-10-20', principal: 1000, interest: 50, confirmed: false },
  { id: 'i2', debt_id: 'loan', seq: 2, due_date: '2026-11-20', principal: 1000, interest: 40, confirmed: false },
  { id: 'i3', debt_id: 'loan', seq: 3, due_date: '2026-12-20', principal: 1000, interest: 30, confirmed: false },
];

function entry(debt_id: string, kind: DebtEntry['kind'], amount: number, entry_date: string): DebtEntry {
  return { id: `${debt_id}${kind}${entry_date}`, debt_id, installment_id: null, kind, amount, entry_date, note: null, transaction_id: null, created_at: '' };
}

describe('buildPayables (รอจ่าย = due this month only)', () => {
  it('counts the KTC bill due 5/10, this month\'s installment and the credit line due 20/10', () => {
    const open = summarizeAll({ debts: [card, cash, loan], installments, entries: [entry('card', 'charge', 300, '2026-10-02')] }, '2026-10-01');
    const p = buildPayables(open, creditors);
    expect(p.thisMonth).toBe(5000 + 60000 + 1050);
    // Spending after the 24/09 cut-off is billed 24/10 and due 5/11; the next installment is due 20/11.
    expect(p.nextMonth).toBe(300 + 1040);
    expect(p.totalOwed).toBe(5300 + 60000 + 3000);
  });

  it('a paid card bill drops out; the next statement waits for next month', () => {
    const entries = [entry('card', 'payment', 5000, '2026-10-01'), entry('card', 'charge', 300, '2026-10-02')];
    const p = buildPayables(summarizeAll({ debts: [card], installments: [], entries }, '2026-10-07'), creditors);
    expect(p.thisMonth).toBe(0);
    expect(p.nextMonth).toBe(300);
  });

  it('an unpaid credit line past its due date stays due (overdue)', () => {
    const p = buildPayables(summarizeAll({ debts: [cash], installments: [], entries: [] }, '2026-10-25'), creditors);
    expect(p.thisMonth).toBe(60000);
    expect(p.items[0].overdue).toBe(true);
  });

  it('after paying the credit line this cycle, it moves to next month', () => {
    const entries = [entry('mom', 'payment', 60000, '2026-10-20'), entry('mom', 'charge', 60000, '2026-10-20')];
    const p = buildPayables(summarizeAll({ debts: [cash], installments: [], entries }, '2026-10-25'), creditors);
    expect(p.thisMonth).toBe(0);
    expect(p.nextMonth).toBe(60000);
  });
});

describe('projectedBalance', () => {
  it('adds what comes in and subtracts what has to be paid this month', () => {
    expect(projectedBalance(15000, 61399.53, 71399.53)).toBe(5000);
  });
});
